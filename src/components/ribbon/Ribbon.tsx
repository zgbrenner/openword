import type { RibbonTabProps } from "./types";
import { HomeTab } from "./HomeTab";
import { InsertTab } from "./InsertTab";
import { LayoutTab } from "./LayoutTab";
import { ReviewTab } from "./ReviewTab";
import { ViewTab } from "./ViewTab";

const TABS = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "layout", label: "Layout" },
  { id: "review", label: "Review" },
  { id: "view", label: "View" },
] as const;

interface RibbonProps extends RibbonTabProps {
  onTabChange: (tab: RibbonTabProps["ui"]["activeRibbonTab"]) => void;
}

export function Ribbon(props: RibbonProps) {
  const active = props.ui.activeRibbonTab;

  return (
    <section className="ribbon" aria-label="Document ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="Ribbon tabs">
        <button
          type="button"
          className="file-tab"
          onClick={props.actions.openBackstage}
        >
          File
        </button>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`ribbon-tab${active === tab.id ? " is-active" : ""}`}
            onClick={() => props.onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ribbon-content" role="tabpanel" aria-label={`${active} commands`}>
        {active === "home" ? <HomeTab {...props} /> : null}
        {active === "insert" ? <InsertTab {...props} /> : null}
        {active === "layout" ? <LayoutTab {...props} /> : null}
        {active === "review" ? <ReviewTab {...props} /> : null}
        {active === "view" ? <ViewTab {...props} /> : null}
      </div>
    </section>
  );
}
