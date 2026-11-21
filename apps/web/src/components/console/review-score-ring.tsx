import type { CSSProperties } from 'react';
import type { TaskReview } from '@libs/shared';

const CENTER = 90;
const RADIUS = 74;
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
    if (item.incomplete || item.result === 'pending') return null;
    return item.result === 'pass' ? 'passed' : 'failed';
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
  const gapDegrees = itemCount > 12 ? 0 : 10;
  const stepDegrees = itemCount === 0 ? 360 : 360 / itemCount;
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
    <svg
      role="img"
      aria-label={`审核评分${task.score === null ? '—' : `${task.score} 分`}`}
      className={
        playing ? 'fw-review-ring fw-review-ring--playing' : 'fw-review-ring'
      }
      viewBox="0 0 180 180"
      width="180"
      height="180"
      focusable="false"
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        className="fw-review-ring__track"
      />
      {segments.map((segment) => {
        const startAngle = segment.startIndex * stepDegrees + gapDegrees / 2;
        const endAngle =
          (segment.startIndex + segment.itemCount) * stepDegrees -
          gapDegrees / 2;
        return (
          <path
            key={`${segment.tone}-${segment.startIndex}`}
            className={`fw-review-ring__arc fw-review-ring__arc--${segment.tone}`}
            d={arcPath(startAngle, endAngle)}
            pathLength="1"
            style={animationStyle(segment, itemCount)}
          />
        );
      })}
      {hasVerdict && (
        <g transform={`translate(${CENTER} ${CENTER - RADIUS})`}>
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
          className="fw-review-ring__burst"
          style={{ '--fw-ring-burst-delay': burstDelay } as CSSProperties}
          onAnimationEnd={onPlaybackEnd}
        />
      )}
      <text
        x={CENTER}
        y={task.score === null ? CENTER : CENTER - 4}
        className="fw-review-ring__score"
      >
        {task.score ?? '—'}
        {task.score !== null && (
          <tspan className="fw-review-ring__unit" dx="4">
            {' 分'}
          </tspan>
        )}
      </text>
    </svg>
  );
}
