import {
  PROJECT_MAINTENANCE_LABELS,
  PROJECT_MATURITY_LABELS,
  type ProjectMaintenance,
  type ProjectMaturity,
} from "../../lib/projectStatus";

interface Props {
  maturity: ProjectMaturity;
  maintenance: ProjectMaintenance;
}

export default function ProjectStatusBadges({ maturity, maintenance }: Props) {
  const maturityLabel = PROJECT_MATURITY_LABELS[maturity];
  const maintenanceLabel = PROJECT_MAINTENANCE_LABELS[maintenance];

  return (
    <div className="project-status-group" aria-label="Project status / 项目状态">
      <span className={`project-status-badge project-status-badge--${maturity}`}>
        <span data-lang="en">{maturityLabel.en}</span>
        <span data-lang="zh">{maturityLabel.zh}</span>
      </span>
      <span className={`project-status-badge project-status-badge--${maintenance}`}>
        <span className="project-status-dot" aria-hidden="true" />
        <span data-lang="en">{maintenanceLabel.en}</span>
        <span data-lang="zh">{maintenanceLabel.zh}</span>
      </span>
    </div>
  );
}
