import Vue from "vue/dist/vue.common.dev";

new Vue({
  delimiters: ["[[", "]]"],
  el: "#counter-app",
  data: {
    count: parseInt(localStorage.count) || 0
  },
  methods: {
    increment: function() {
      this.count++;
      localStorage.count = this.count;
    }
  }
});
