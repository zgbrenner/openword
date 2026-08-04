import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { IconButton } from "./IconButton";

export type NoticeKind = "success" | "info" | "error";

export interface NoticeState {
  id: number;
  kind: NoticeKind;
  title: string;
  message?: string;
}

interface NoticeProps {
  notice: NoticeState;
  onClose: () => void;
}

export function Notice({ notice, onClose }: NoticeProps) {
  const Icon = notice.kind === "success" ? CheckCircle2 : notice.kind === "error" ? AlertCircle : Info;
  return (
    <div className={`notice notice--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <Icon size={19} aria-hidden="true" />
      <div className="notice__copy">
        <strong>{notice.title}</strong>
        {notice.message ? <span>{notice.message}</span> : null}
      </div>
      <IconButton label="Dismiss notification" icon={<X size={16} />} onClick={onClose} compact />
    </div>
  );
}
