import {
  ProjectLoadWarning,
  type ProjectLoadWarning as ProjectLoadWarningT,
} from "@/domains/project-load-warning";

type ProjectLoadWarningsProps = {
  /** プロジェクトの最新 snapshot に含まれる読み込み警告。 */
  warnings: readonly ProjectLoadWarningT[];
};

/**
 * loaded board に表示する、展開可能な読み込み警告一覧。
 * @param props - {@link ProjectLoadWarningsProps}
 * @returns 警告が 1 件以上あれば警告パネル、無ければ `null`
 */
export const ProjectLoadWarnings = ({ warnings }: ProjectLoadWarningsProps) => {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="project-load-warnings-title"
      aria-live="polite"
      data-testid="project-load-warnings"
      className="mx-3 mt-3 shrink-0 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2
          id="project-load-warnings-title"
          className="min-w-0 truncate font-medium text-warning-foreground"
        >
          読み込み時の注意（{warnings.length}件）
        </h2>
        <details className="min-w-0 shrink-0">
          <summary className="cursor-pointer text-warning-foreground underline-offset-2 hover:underline">
            原因を確認する
          </summary>
          <ul className="mt-2 max-w-full space-y-2 border-t border-warning/30 pt-2">
            {warnings.map((warning) => {
              const warningKey = ProjectLoadWarning.fingerprint([warning]);
              return (
                <li
                  key={warningKey}
                  className="min-w-0 rounded border border-warning/30 bg-surface/70 p-2"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-warning-foreground">
                      {ProjectLoadWarning.codeLabel(warning.code)}
                    </span>
                    <span className="text-muted">
                      処理: {ProjectLoadWarning.stageLabel(warning.stage)}
                    </span>
                    <code className="min-w-0 max-w-full break-all text-xs text-muted">
                      {warning.path ?? "プロジェクト全体"}
                    </code>
                  </div>
                  <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-muted">
                    {warning.message || "詳細は確認できませんでした"}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      </div>
    </section>
  );
};
