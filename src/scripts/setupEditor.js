import CodeMirror from "codemirror";
import "codemirror/mode/markdown/markdown";
import "codemirror/addon/mode/overlay";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/idea.css";
import "codemirror/theme/neat.css";

import "codemirror/addon/dialog/dialog";
import "codemirror/addon/dialog/dialog.css";
import "codemirror/addon/fold/foldcode";
import "codemirror/addon/fold/foldgutter";
import "codemirror/addon/fold/foldgutter.css";
import "codemirror/addon/fold/brace-fold";
import "codemirror/addon/fold/comment-fold";
import "codemirror/addon/fold/indent-fold";
import "codemirror/addon/fold/xml-fold";
import "codemirror/addon/hint/show-hint";
import "codemirror/addon/hint/show-hint.css";
import "codemirror/addon/comment/comment";
import "codemirror/addon/search/search";
import "codemirror/addon/search/searchcursor";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/search/matchesonscrollbar";
import "codemirror/addon/search/matchesonscrollbar.css";
import "codemirror/addon/selection/active-line";
import "codemirror/addon/selection/selection-pointer";
import "codemirror/addon/display/placeholder";
import "codemirror/addon/lint/lint";
import "codemirror/addon/lint/json-lint";
import "codemirror/addon/lint/lint.css";

import codeMirrorTypo from "codemirror-typo";

export function setupEditor(textareaEl, containerEl) {
  const cm = CodeMirror(
    function(elt) {
      containerEl.parentNode.replaceChild(elt, containerEl);
    },
    {
      value: textareaEl.value,
      theme: "neat",
      mode: "spell-checker",
      backdrop: "markdown",
      placeholder: "Start Typing...",
      height: "auto",
      foldGutter: true,
      lineWrapping: true,
      scrollbarStyle: "native",
      viewportMargin: 30, // default 10
      selectionPointer: "default",
      showCursorWhenSelecting: false,
      cursorScrollMargin: 12, // NOTE: This is px
      extraKeys: CodeMirror.normalizeKeyMap({
        "Cmd-F": "findPersistent",
        "Ctrl-F": "findPersistent"
      })
    }
  );

  cm.on("change", (c, v) => {
    textareaEl.value = c.getValue();
  });

  codeMirrorTypo(cm, "en_US", "/static/build/dictionaries");

  return cm;
}
