import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Store,
} from 'lucide-react';
import '../styles/design-samples.css';

type QueueState = 'submitted' | 'in_review';

type QueueInspection = {
  code: string;
  site: string;
  template: string;
  state: QueueState;
  status: string;
  score: string;
};

const queue: QueueInspection[] = [
  {
    code: 'NB-004',
    site: 'Northbean Coffee 4',
    template: '开店检查',
    state: 'submitted',
    status: '待审核',
    score: '未评分',
  },
  {
    code: 'NB-005',
    site: 'Northbean Coffee 5',
    template: '开店检查',
    state: 'submitted',
    status: '待审核',
    score: '未评分',
  },
];

const navigation = [
  { label: '审核队列', icon: ClipboardCheck, active: true },
  { label: '总部看板', icon: LayoutDashboard, active: false },
  { label: '门店', icon: Store, active: false },
  { label: '模板', icon: FileText, active: false },
];

export function DesignSamplesPage() {
  const [queueState, setQueueState] = useState<QueueState>('submitted');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const visibleQueue = queue.filter((item) => item.state === queueState);
  const selected = visibleQueue.find((item) => item.code === selectedCode);
  const inReviewCount = queue.filter(
    (item) => item.state === 'in_review',
  ).length;

  return (
    <main className="sample-picker">
      <section className="direction-shell" aria-label="主管审核队列样张">
        <aside className="direction-sidebar">
          <div className="direction-brand">
            <span className="direction-brand__name">FloorWalk</span>
            <span className="direction-brand__tenant">Northbean Coffee</span>
          </div>
          <nav className="direction-nav" aria-label="工作台">
            {navigation.map(({ label, icon: Icon, active }) => (
              <span
                key={label}
                className={`direction-nav__item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </span>
            ))}
          </nav>
          <div className="direction-sidebar__foot">主管工作台</div>
        </aside>

        <header className="direction-topbar">
          <span className="direction-topbar__title">Northbean Coffee</span>
          <span className="direction-topbar__scope">主管工作台</span>
        </header>

        <div className="direction-sheet">
          <div className="direction-mobile-nav" aria-label="移动导航">
            <span aria-current="page">审核</span>
            <span>看板</span>
            <span>门店</span>
            <span>模板</span>
          </div>

          <div className="queue-heading">
            <div>
              <p className="queue-eyebrow">现场提交的巡检单</p>
              <h1>审核队列</h1>
              <p className="queue-finding">
                有{' '}
                <strong>
                  {queue.filter((item) => item.state === 'submitted').length}
                </strong>{' '}
                份巡检单等待主管复核。
              </p>
            </div>
            <Link to="/console" className="queue-heading__link">
              返回工作台 <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          <div className="queue-section-heading">
            <h2>{queueState === 'submitted' ? '待审核' : '审核中'}</h2>
          </div>

          <div className="queue-tabs" role="tablist" aria-label="审核状态">
            <button
              type="button"
              role="tab"
              aria-selected={queueState === 'submitted'}
              onClick={() => setQueueState('submitted')}
            >
              待审核 <span>{queue.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={queueState === 'in_review'}
              onClick={() => setQueueState('in_review')}
            >
              审核中 <span>{inReviewCount}</span>
            </button>
          </div>

          <div className="queue-table" role="group" aria-label="待审核巡检单">
            <div className="queue-table__head" aria-hidden="true">
              <span>门店</span>
              <span>检查模板</span>
              <span>分数</span>
              <span>状态</span>
              <span />
            </div>
            {visibleQueue.map((item) => (
              <button
                type="button"
                key={item.code}
                className={`queue-row${selectedCode === item.code ? ' is-selected' : ''}`}
                aria-pressed={selectedCode === item.code}
                onClick={() =>
                  setSelectedCode((current) =>
                    current === item.code ? null : item.code,
                  )
                }
              >
                <span className="queue-row__identity">
                  <strong>{item.site}</strong>
                  <span className="queue-row__code">{item.code}</span>
                </span>
                <span className="queue-row__template">{item.template}</span>
                <span className="queue-row__score">{item.score}</span>
                <span className="queue-row__status">{item.status}</span>
                <span className="queue-row__action">
                  查看巡检单 <ArrowRight aria-hidden="true" />
                </span>
              </button>
            ))}
            {visibleQueue.length === 0 && (
              <p className="queue-empty">当前没有审核中的巡检单。</p>
            )}
          </div>

          {selected && (
            <p className="queue-selection" aria-live="polite">
              已选中 {selected.site} · {selected.code}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
