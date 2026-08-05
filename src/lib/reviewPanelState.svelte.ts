export type ReviewTab = "comments" | "changes";

export class ReviewPanelState {
  open = $state(false);
  tab = $state<ReviewTab>("comments");

  show = (tab?: ReviewTab) => {
    if (tab) this.tab = tab;
    this.open = true;
  };

  toggle = (tab?: ReviewTab) => {
    if (this.open && (!tab || tab === this.tab)) {
      this.open = false;
    } else {
      this.show(tab);
    }
  };

  close = () => {
    this.open = false;
  };
}
