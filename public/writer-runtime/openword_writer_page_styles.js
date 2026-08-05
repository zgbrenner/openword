/* SPDX-License-Identifier: Apache-2.0 */
"use strict";

var OPENWORD_WRITER_PAGE_STYLES = Object.freeze({
  updatesFor(command) {
    if (!command || typeof command.enabled !== "boolean") {
      throw new Error("Page-style commands require an enabled boolean");
    }

    switch (command.type) {
      case "header.setEnabled":
        return [{ property: "HeaderIsOn", value: command.enabled }];
      case "footer.setEnabled":
        return [{ property: "FooterIsOn", value: command.enabled }];
      case "pageStyle.setDifferentFirstPage":
        return [{ property: "FirstIsShared", value: !command.enabled }];
      case "pageStyle.setDifferentOddEven":
        return [
          { property: "HeaderIsShared", value: !command.enabled },
          { property: "FooterIsShared", value: !command.enabled },
        ];
      default:
        throw new Error(`Unsupported page-style command: ${String(command.type)}`);
    }
  },

  read(pageStyleName, readProperty) {
    const headerShared = Boolean(readProperty("HeaderIsShared"));
    const footerShared = Boolean(readProperty("FooterIsShared"));
    return {
      pageStyleName,
      headerEnabled: Boolean(readProperty("HeaderIsOn")),
      footerEnabled: Boolean(readProperty("FooterIsOn")),
      differentFirstPage: !Boolean(readProperty("FirstIsShared")),
      differentOddEven: !headerShared || !footerShared,
    };
  },
});
