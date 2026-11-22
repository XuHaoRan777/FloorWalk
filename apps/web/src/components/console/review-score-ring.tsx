import type { CSSProperties } from 'react';
import type { TaskReview } from '@libs/shared';

const CENTER = 90;
const RADIUS = 74;
const STROKE_WIDTH = 10;
const SEGMENT_GAP_DEGREES = 10;
const DRAW_SECONDS = 0.6;

type SegmentTone = 'passed' | 'failed' | null;

type RingSegment = {
  tone: Exclude<SegmentTone, null>;
  startIndex: number;
  itemCount: number;
};

function pointAt(angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.sin(radians),
    y: CENTER - RADIUS * Math.cos(radians),
  };
}

function arcPath(startAngle: number, endAngle: number) {
  const start = pointAt(startAngle);
  const end = pointAt(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  if (endAngle - startAngle >= 360) {
    const middle = pointAt(startAngle + 180);
    return [
      `M${start.x} ${start.y}`,
      `A${RADIUS} ${RADIUS} 0 0 1 ${middle.x} ${middle.y}`,
      `A${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`,
    ].join('');
  }

  return `M${start.x} ${start.y}A${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function segmentTones(task: TaskReview): SegmentTone[] {
  return task.items.map((item) => {
    if (item.result === 'pass') return 'passed';
    if (
      item.result === 'pending' ||
      (item.incomplete && !item.manuallyDecidedAfterCompletion)
    )
      return null;
    return 'failed';
  });
}

function ringSegments(
  tones: SegmentTone[],
  mergeAdjacent: boolean,
): RingSegment[] {
  if (!mergeAdjacent) {
    return tones.flatMap((tone, startIndex): RingSegment[] =>
      tone === null ? [] : [{ tone, startIndex, itemCount: 1 }],
    );
  }

  const groups: Array<{
    tone: SegmentTone;
    startIndex: number;
    itemCount: number;
  }> = [];
  tones.forEach((tone, startIndex) => {
    const previous = groups.at(-1);
    if (previous?.tone === tone) {
      previous.itemCount += 1;
    } else {
      groups.push({ tone, startIndex, itemCount: 1 });
    }
  });

  const first = groups[0];
  const last = groups.at(-1);
  const firstTone = first?.tone;
  if (
    groups.length > 1 &&
    first &&
    last &&
    firstTone &&
    firstTone === last.tone
  ) {
    const wrapped: RingSegment = {
      tone: firstTone,
      startIndex: last.startIndex,
      itemCount: first.itemCount + last.itemCount,
    };
    const innerSegments = groups.slice(1, -1).flatMap((group): RingSegment[] =>
      group.tone
        ? [
            {
              tone: group.tone,
              startIndex: group.startIndex,
              itemCount: group.itemCount,
            },
          ]
        : [],
    );
    return [...innerSegments, wrapped];
  }

  return groups.flatMap((group): RingSegment[] =>
    group.tone ? [{ ...group, tone: group.tone }] : [],
  );
}

function animationStyle(
  segment: RingSegment,
  itemCount: number,
): CSSProperties {
  return {
    '--fw-ring-delay': `${(segment.startIndex * DRAW_SECONDS) / itemCount}s`,
    '--fw-ring-duration': `${(segment.itemCount * DRAW_SECONDS) / itemCount}s`,
  } as CSSProperties;
}

export function ReviewScoreRing({
  task,
  playing,
  onPlaybackEnd,
}: {
  task: TaskReview;
  playing: boolean;
  onPlaybackEnd: () => void;
}) {
  const itemCount = task.items.length;
  const tones = segmentTones(task);
  const isPassed =
    task.decidedAt !== null && task.inspectionStatus === 'passed';
  const hasVerdict = task.decidedAt !== null;
  const segments = ringSegments(tones, itemCount > 12);
  const capCoverageDegrees =
    (Math.asin(STROKE_WIDTH / (2 * RADIUS)) * 180) / Math.PI;
  const arcInsetDegrees =
    itemCount > 12 ? 0 : SEGMENT_GAP_DEGREES / 2 + capCoverageDegrees;
  const stepDegrees = itemCount === 0 ? 360 : 360 / itemCount;
  const lastScoredIndex = tones.reduce(
    (lastIndex, tone, index) => (tone ? index : lastIndex),
    -1,
  );
  const badgeAngle =
    itemCount === 0 ? 0 : (((lastScoredIndex + 1) * 360) / itemCount) % 360;
  const badgePosition = pointAt(badgeAngle);
  const lastArcEnd = segments.reduce(
    (latest, segment) =>
      Math.max(
        latest,
        ((segment.startIndex + segment.itemCount) * DRAW_SECONDS) / itemCount,
      ),
    0,
  );
  const badgeDelay = `${lastArcEnd}s`;
  const burstDelay = `${lastArcEnd + 0.12}s`;

  return (
    <div
      role="img"
      aria-label={`审核评分${task.score === null ? '—' : `${task.score} 分`}`}
      className={
        playing ? 'fw-review-ring fw-review-ring--playing' : 'fw-review-ring'
      }
    >
      <svg
        aria-hidden="true"
        className="fw-review-ring__drawing"
        viewBox="0 0 180 180"
        focusable="false"
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          strokeWidth={STROKE_WIDTH}
          className="fw-review-ring__track"
        />
        {segments.map((segment) => {
          const startAngle = segment.startIndex * stepDegrees + arcInsetDegrees;
          const endAngle =
            (segment.startIndex + segment.itemCount) * stepDegrees -
            arcInsetDegrees;
          return (
            <path
              key={`${segment.tone}-${segment.startIndex}`}
              className={`fw-review-ring__arc fw-review-ring__arc--${segment.tone}`}
              d={arcPath(startAngle, endAngle)}
              pathLength="1"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap={itemCount > 12 ? 'butt' : 'round'}
              style={animationStyle(segment, itemCount)}
            />
          );
        })}
        {hasVerdict && (
          <g transform={`translate(${badgePosition.x} ${badgePosition.y})`}>
            <g
              className={`fw-review-ring__badge fw-review-ring__badge--${isPassed ? 'passed' : 'failed'}`}
              style={{ '--fw-ring-badge-delay': badgeDelay } as CSSProperties}
              onAnimationEnd={isPassed ? undefined : onPlaybackEnd}
            >
              <circle r="14" />
              {isPassed ? (
                <path d="m-5 0.5 3.2 3.2L5.5-3.8" />
              ) : (
                <>
                  <path d="M0-5.5v6" />
                  <circle cy="4.6" r="1.5" />
                </>
              )}
            </g>
          </g>
        )}
        {isPassed && playing && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            strokeWidth={STROKE_WIDTH}
            className="fw-review-ring__burst"
            style={{ '--fw-ring-burst-delay': burstDelay } as CSSProperties}
            onAnimationEnd={onPlaybackEnd}
          />
        )}
      </svg>
      <span className="fw-review-ring__content">
        <strong>{task.score ?? '—'}</strong>
        {task.score !== null && <small>分</small>}
      </span>
    </div>
  );
}
