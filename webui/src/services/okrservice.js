import AuthSvc from './authservice';

const MicrosoftGraph = require('@microsoft/microsoft-graph-client');
const ACCESS_TOKEN_RESOURCE = 'https://graph.microsoft.com';

const NOTEBOOK_NAME = 'Okeears';
const SECTION_NAME = 'FY2018';
const PAGE_TITLE = 'Objectives';

const PAGE_TEMPLATE = 
`<html>
    <head>
        <title>${PAGE_TITLE}</title>
    </head>
    <body>
        <div>
        </div>
    </body>
</html>`;

export default class OkrService {
    constructor() {
        
        // Stores mapping from user id to his objective's page id
        this.pageIds = new Map();

        this.graphClient = MicrosoftGraph.Client.init({
            //debugLogging: true,
            authProvider: (done) => {
                AuthSvc.withToken((token) => {
                    done(null, token);
                }, ACCESS_TOKEN_RESOURCE);
            }
        });
    }

    getObjectives(subjectId, userId, dataHandler, errHandler) {
        let allowPageCreation = subjectId == userId;
        this.getPageContent(subjectId, allowPageCreation, (document) => {
            
            // There are no objectives created yet
            if(!document) {
                return dataHandler([]);
            }

            // Reference HTML
            // <ul id="ul:{d4a13ad7-37ee-46d4-acdb-80b67c839aaa}{167}" data-id="objectives">
            //     <li id="li:{82859f00-f0c9-4726-8174-2c0bd865a59b}{82}" data-id="llfsd39mx">
            //         <p id="p:{82859f00-f0c9-4726-8174-2c0bd865a59b}{83}" style="margin-top:0pt;margin-bottom:0pt">Objective One</p>
            //         <ul id="ul:{82859f00-f0c9-4726-8174-2c0bd865a59b}{84}">
            //             <li id="li:{82859f00-f0c9-4726-8174-2c0bd865a59b}{88}">Key Result One</li>
            //             <li id="li:{82859f00-f0c9-4726-8174-2c0bd865a59b}{92}">Key Result Two</li>
            //         </ul>
            //     </li>
            //     <li id="li:{2db45fc0-8282-4d11-823f-011d2f7c8625}{33}" data-id="llfsd39mx">Objective Two</li>
            // </ul>

            let objectivesNode = document.querySelector(`div > ul`);
            if(!objectivesNode) {
                return dataHandler([]);
            }

            let nodes = Array.from(objectivesNode.querySelectorAll('li[data-id]'));
            let objectives = nodes.map(each => {
                let resultNodes = Array.from(each.querySelectorAll('li'));
                const keyResults = resultNodes.map(each => {
                    return {
                        statement: each.innerText
                    }
                });

                let paragraphNode = each.querySelector('p');
                let statement = paragraphNode ? paragraphNode.innerText : each.innerText;
                return {
                    id: each.getAttribute('data-id'),
                    statement: statement,
                    keyresults: keyResults
                };
            });
            
            dataHandler(objectives);
        }, errHandler);
    }

    createObjective(subjectId, objective, dataHandler, errHandler) {
        
        // Very simple unique id generator
        objective.id = Math.random().toString(36).substr(2, 9);
        
        // TODO: Escape HTML in objective's statement
        let statement = objective.statement;

        this.getPageContent(subjectId, true, (document) => {

            // If undefined - this is the first objective, 
            // need to add both ul and li tags
            let objectivesNode = document.querySelector(`div > ul`);
            let patchBody = objectivesNode ? 
                [{
                      'target': `${objectivesNode.getAttribute('id')}`,
                      'action': 'append',
                      'content': `<li data-id="${objective.id}"><p>${statement}</p></li>`
                }] : 
                [{
                    // In OneNote the 'body' target means the first div on page
                    'target': `body`,
                    'action': 'append',
                    'content': `<ul><li data-id="${objective.id}"><p>${statement}</p></li></ul>`
                }];

            this.graphClient
                .api(this.getSubjectPageContentUrl(subjectId))
                .patch(patchBody)
                .then((body) => dataHandler(objective))
                .catch(errHandler);
        }, errHandler);
    }

    changeObjective(subjectId, objective, dataHandler, errHandler) {
        let objectiveId = objective.id;
        // TODO: Escape HTML in objective's statement
        let statement = objective.statement;

        this.getPageContent(subjectId, false, (document) => {

            if(!document) {
                return errHandler({message: "Cannot found Objective's OneNote page."});
            };

            // Change operations should reference items by unique id generated by OneNote,
            // referencing by data-id is not supported
            const objectiveNode = document.querySelector(`li[data-id="${objectiveId}"]`);
            const objectiveNodeId =  objectiveNode.getAttribute('id');

            let keyResultsContent = '';
            if(objective.keyresults && objective.keyresults.length > 0) {
                let itemsContent = '';
                objective.keyresults.forEach(each => {
                    itemsContent += `<li>${each.statement}</li>`;
                });
                keyResultsContent = `<ul>${itemsContent}</ul>`;
            }

            // New content we want to save
            const content = `<li data-id="${objectiveId}"><p>${statement}</p>${keyResultsContent}</li>`;
            
            // This is absolutely crazy OneNote behavior :(
            // It seems it does not support replacing the whole node (ul, li etc.) with the new content.
            // Instead it copies old content outside the target node, and only then replaces node's content.
            // So we need to remove (replace with empty nodes) all the existing content recursively, and then add new content.
            let patchBody = [];

            const existingKeyResultsNode = objectiveNode.querySelector('ul');
            if(existingKeyResultsNode) {
                // Remove existing key results nodes, if any
                const existingKeyResultNodes = existingKeyResultsNode.querySelectorAll('li');
                Array.from(existingKeyResultNodes).forEach(each => {
                    patchBody.push(
                        {
                            'target': `${each.getAttribute('id')}`,
                            'action': 'replace',
                            'content': '<li></li>'
                        });
                });

                // Remove existing key result list node
                patchBody.push(
                {
                    'target': `${existingKeyResultsNode.getAttribute('id')}`,
                    'action': 'replace',
                    'content': '<ul></ul>'
                });
            }

            patchBody.push(
                {
                    'target': `${objectiveNodeId}`,
                    'action': 'replace',
                    'content': content
                }
            );
            
            this.graphClient
                .api(this.getSubjectPageContentUrl(subjectId))
                .patch(patchBody)
                .then(dataHandler)
                .catch(errHandler); 
        }, errHandler);
    }

    deleteObjective(subjectId, objectiveId, successHandler, errHandler) {
        this.getPageContent(subjectId, false, (document) => {

            if(!document) {
                return errHandler({message: "Cannot found Objective's OneNote page."});
            }

            let listNodeId = document.querySelector(`li[data-id="${objectiveId}"]`).getAttribute('id');

            // OneNote does not support explicit delete operation, so patching with 
            // the empty item - it will be completely removed in OneNote page
            let patchBody = [
                {
                'target': `${listNodeId}`,
                'action': 'replace',
                'content':'<li></li>'
                }];
            this.graphClient
                .api(this.getSubjectPageContentUrl(subjectId))
                .patch(patchBody)
                .then(successHandler)
                .catch(errHandler); 
        }, errHandler);
    }

    createPage(subjectId, dataHandler, errHandler) {
        this.graphClient
            .api('me/onenote/notebooks')
            .post({ displayName: NOTEBOOK_NAME })
            .then((body) => {
                let notebookId = body.id;
                this.graphClient
                    .api(`me/onenote/notebooks/${notebookId}/sections`)
                    .post({ displayName: SECTION_NAME })
                    .then((body) => {
                        let sectionId = body.id;
                        this.graphClient
                            .api(`me/onenote/sections/${sectionId}/pages`)
                            .header("Content-Type", "application/xhtml+xml")
                            .post(PAGE_TEMPLATE)
                            .then((body) => {
                                let pageId = body.id;
                                this.setSubjectPageId(subjectId, pageId);
                                this.shareNotebook(errHandler);

                                dataHandler(pageId);
                            })
                            .catch(errHandler);
                    })
                    .catch(errHandler);
            })
            // TODO: Handle error code 20117 "An item with this name already exists in this location."
            .catch(errHandler);
    }

    shareNotebook(errHandler) {
        let body = {
            "recipients": [
                {
                    "alias": "Everyone except external users"
                }
            ],
            "requireSignIn": true,
            "sendInvitation": false,
            "roles": [ 
                "read"
            ]
        };
        let url = `me/drive/root:/Notebooks/${NOTEBOOK_NAME}:/invite`;
        this.graphClient
            .api(url)
            .post(body)
            .then(data => {
                // console.log(data);
            })
            .catch(errHandler); 
    }

    getPageContent(subjectId, createPage, dataHandler, errHandler) {
        this.searchForOneNotePage(subjectId, (pageId) => {
            // Page ID is received from OneNote or taken from the cache
            if(pageId) {
                this.graphClient
                    .api(this.getSubjectPageContentUrl(subjectId))
                    .responseType('document')
                    .query({'includeIDs':'true'})
                    .get()
                    .then((body) => {
                        if(ArrayBuffer.isView(body)) {
                            // Chrome, Edge on Windows
                            let document = new DOMParser().parseFromString(body, 'text/html');
                            dataHandler(document);   
                        } else {
                            // Chrome on Mac, probably something else
                            dataHandler(body);   
                        }
                    })
                    .catch(errHandler);
            } else {
                if(createPage) {
                    // Assuming that newly created page body is not required, 
                    // so returning null here.
                    this.createPage(subjectId, () => { dataHandler(null); }, errHandler);
                } else {
                    dataHandler(null);
                }
            }
        }, errHandler);
    }

    searchForOneNotePage(subjectId, dataHandler, errHandler) {
        let pageId = this.getSubjectPageId(subjectId);
        if(pageId) {
            dataHandler(pageId);
            return;
        }

        this.graphClient
            .api(`${this.getSubjectPrefix(subjectId)}/onenote/pages`)
            // Searches for the page with specified title across all user's notebooks
            .filter(`title eq '${PAGE_TITLE}'`)
            .select('id')
            .expand('parentNotebook')
            .get()
            .then((body) => {
                // Filter out pages from another notebooks, if any
                let pages = body.value.filter(page => page.parentNotebook.displayName == NOTEBOOK_NAME);
                if(pages.length == 1) {
                    let pageId = pages[0].id;
                    this.setSubjectPageId(subjectId, pageId);
                    dataHandler(pageId);
                } else if(pages.length == 0) {
                    dataHandler(null);
                } else {
                    errHandler({ message: `More than one '${PAGE_TITLE}' page found.`});
                }
            })
            .catch(errHandler);
    }

    getSubjectPrefix(subjectId) {
        return `/users/${subjectId}`;
    }

    setSubjectPageId(subjectId, pageId) {
        this.pageIds.set(subjectId, pageId);
    }

    getSubjectPageId(subjectId)
    {
        return this.pageIds.get(subjectId);
    }

    // Assuming that page is already created and its id is in cache
    getSubjectPageContentUrl(subjectId)
    {
        let prefix = this.getSubjectPrefix(subjectId);
        let pageId = this.getSubjectPageId(subjectId);
        return `${prefix}/onenote/pages/${pageId}/content`;
    }
}
