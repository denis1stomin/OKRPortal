import AuthSvc from './../../services/authservice'
import GraphSubjectService from './../../services/graphsubjectservice'

const SubjectSvc = new GraphSubjectService();

export default {
    state: {
        // current authentificated user
        me: {},

        // an interesting subject for current user (be default the user himself)
        interestingSubject: {},

        // org tree for the interesting subject
        orgtree: [],

        // selected subject (a single item from current org tree)
        selectedSubject: {},

        // list of subjects which could be interesting to current user
        suggestedSubjectsList: [],

        // last error
        error: ''
    },

    mutations: {
        CURRENT_USER_COMPLETE(state, value) {
            state.me = value;
        },

        CURRENT_USER_FAILED(state, value) {
            state.error = value;
        },

        ORGTREE_COMPLETE(state, value) {
            state.orgtree = value;
        },

        ORGTREE_FAILED(state, value) {
            state.error = value;
        },

        SUGGESTED_SUBJECTS_LIST(state, value) {
            state.suggestedSubjectsList = value;
        },

        INTERESTING_SUBJECT(state, value) {
            state.interestingSubject = value;
        },

        SELECTED_SUBJECT(state, value) {
            state.selectedSubject = value;
        }
    },

    // getters: {
    //     GET_SELECTED_SUBJECT(state) {
    //         return state.selectedSubject;
    //     }
    // },

    actions: {
        // Gets current authentificated user
        GET_CURRENT_USER(context) {
            // Get user basic information from the token
            const rawUser = AuthSvc.getCurrentUser();
            const user = {
                id: rawUser.profile.oid,
                name: rawUser.userName
            };

            context.commit('CURRENT_USER_COMPLETE', user);
            context.dispatch('SET_INTERESTING_SUBJECT', user);
        },

        // Gets list of relevant subjects to current user
        GET_RELEVANT_SUBJECTS(context) {
            AuthSvc.withToken((token) => {
                SubjectSvc.getCurrentUserRelevantPeople(
                    (done) => {
                        done(null, token);
                    },
                    data => context.commit('SUGGESTED_SUBJECTS_LIST', data),
                    err => console.log(err)
                );
            }, SubjectSvc.accessTokenResource());
        },

        // Searches subjects using text search
        SEARCH_SUBJECTS(context, searchQuery) {
            AuthSvc.withToken((token) => {
                SubjectSvc.findPeople(
                    searchQuery,
                    (done) => {
                        done(null, token);
                    },
                    data => context.commit('SUGGESTED_SUBJECTS_LIST', data),
                    err => console.log(err)
                );
            }, SubjectSvc.accessTokenResource());
        },

        SET_INTERESTING_SUBJECT(context, subject) {
            context.commit('INTERESTING_SUBJECT', subject);
            context.dispatch('GET_ORGTREE');
            context.dispatch('SET_SELECTED_SUBJECT', subject);
        },

        SET_SELECTED_SUBJECT(context, subject) {
            context.commit('SELECTED_SUBJECT', subject);
            context.dispatch('GET_OBJECTIVES');
        },

        // Gets OrgTree for an interesting subject
        GET_ORGTREE(context) {
            AuthSvc.withToken((token) => {
                SubjectSvc.getSubjectOrgTree(
                    context.state.interestingSubject.id,
                    (done) => {
                        done(null, token);
                    },
                    data => context.commit('ORGTREE_COMPLETE', data),
                    err => console.log(err)
                );
            }, SubjectSvc.accessTokenResource());
        }
    }
}
