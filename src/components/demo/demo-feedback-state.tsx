import Link from "next/link";

type FeedbackStateProps = {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  title: string;
};

export function DemoEmptyState({ actionHref, actionLabel, description, title }: FeedbackStateProps) {
  return (
    <div className="demo-feedback-state demo-feedback-state-empty" role="status">
      <span aria-hidden="true" className="demo-feedback-state-mark">○</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {actionHref && actionLabel ? <Link className="demo-secondary-link" href={actionHref}>{actionLabel}</Link> : null}
    </div>
  );
}

export function DemoLoadingState() {
  return (
    <div className="demo-loading-page" aria-busy="true" aria-label="Cargando vista de DeskWork" role="status">
      <div className="demo-loading-line demo-loading-line-short" />
      <div className="demo-loading-line demo-loading-line-title" />
      <div className="demo-loading-line demo-loading-line-copy" />
      <div className="demo-loading-grid">
        <div className="demo-loading-card" />
        <div className="demo-loading-card" />
        <div className="demo-loading-card" />
      </div>
    </div>
  );
}
