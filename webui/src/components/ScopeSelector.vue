<template>
    <div class="input-form">
        <select v-model="scope">
            <option v-for="scope in scopes" v-bind:value="scope" :key="scope.id"> {{ scope.name }}</option>
        </select>
    </div>
</template>

<script>
    export default {
        name: 'ScopeSelector',
        
        computed: {
            scopes: {
                get() {
                    return this.$store.state.okr.scopes;
                }
            },

            scope: {
                get() {
                    return this.$store.state.okr.scope;
                },

                set(value) {
                    this.$store.dispatch('SET_SCOPE', value);
                }
            }
        }
    }
</script>
