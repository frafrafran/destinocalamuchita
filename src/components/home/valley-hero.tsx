"use client";

import { type MotionValue, motion, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { type ReactNode, useRef } from "react";

export interface ValleyLayers {
  /** Distant range, behind everything but the photo. */
  mid: ReactNode;
  /** Foreground hills that frame the scene and part as you scroll. */
  left: ReactNode;
  right: ReactNode;
  /** Valley floor and the page-coloured hillside that hand over to the next section. */
  near: ReactNode;
  ground: ReactNode;
}

interface Props {
  photo: ReactNode;
  layers: ValleyLayers;
  intro: ReactNode;
  statement: string;
  scrollHint: string;
}

/**
 * Home hero as a pinned scene: scrolling "flies" into the valley. The foreground hills part, the photo
 * dollies in, mist gathers and the title gives way to a line revealed word by word, until a hillside in
 * the page colour rises and hands over to the next section.
 * Only transform and opacity animate (compositor-only). Under prefers-reduced-motion the scene is a
 * still, one-screen hero (its height comes from --home-hero-h in globals.css, so SSR already matches).
 */
export function ValleyHero({ photo, layers, intro, statement, scrollHint }: Props) {
  const section = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  // Passing progress through a function keeps every layer on the same JS-driven value. Mapped straight
  // from scrollYProgress, Motion hands opacity to a native ViewTimeline whose range is wrong for a
  // pinned (sticky) section, so fades would drift out of sync with the transforms.
  const tracked = useTransform(scrollYProgress, (value) => value);
  const still = useMotionValue(0);
  const progress = reduce ? still : tracked;

  const photoScale = useTransform(progress, [0, 1], [1.08, 1.32]);
  const photoY = useTransform(progress, [0, 1], ["0%", "5%"]);
  const mist = useTransform(progress, [0.12, 0.8], [0, 1]);

  const midScale = useTransform(progress, [0, 1], [1, 1.18]);
  const midY = useTransform(progress, [0, 1], ["0%", "12%"]);

  const leftX = useTransform(progress, [0, 0.7], ["0%", "-62%"]);
  const rightX = useTransform(progress, [0, 0.7], ["0%", "62%"]);
  const sideY = useTransform(progress, [0, 0.7], ["0%", "30%"]);
  const sideScale = useTransform(progress, [0, 0.7], [1, 1.9]);

  const introOpacity = useTransform(progress, [0, 0.22], [1, 0]);
  const introY = useTransform(progress, [0, 0.3], [0, -90]);
  const introEvents = useTransform(introOpacity, (value) => (value < 0.35 ? "none" : "auto"));
  const hintOpacity = useTransform(progress, [0, 0.05], [1, 0]);

  const statementOpacity = useTransform(progress, [0.24, 0.34, 0.88, 1], [0, 1, 1, 0]);
  const statementY = useTransform(progress, [0.24, 1], [48, -56]);

  const nearY = useTransform(progress, [0.45, 0.95], ["100%", "0%"]);
  const groundY = useTransform(progress, [0.62, 1], ["100%", "0%"]);

  const words = statement.split(" ");

  return (
    <section ref={section} className="relative h-(--home-hero-h) bg-(--scene-ink) text-white">
      <div className="sticky top-0 isolate h-svh overflow-hidden">
        <motion.div className="absolute inset-0 -z-10 will-change-transform" style={{ scale: photoScale, y: photoY }}>
          {photo}
        </motion.div>
        <div aria-hidden className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/45 to-transparent" />
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_30%,rgba(214,228,220,0.38)_66%,rgba(214,228,220,0.08)_100%)]"
          style={{ opacity: mist }}
        />

        <motion.div aria-hidden className="absolute inset-x-0 bottom-0 h-[38svh] origin-bottom will-change-transform md:h-[50svh]" style={{ scale: midScale, y: midY }}>
          {layers.mid}
        </motion.div>
        <motion.div
          aria-hidden
          className="absolute bottom-0 left-0 h-[48svh] w-[78%] origin-bottom-left will-change-transform md:h-[68svh] md:w-[62%]"
          style={{ x: leftX, y: sideY, scale: sideScale }}
        >
          {layers.left}
        </motion.div>
        <motion.div
          aria-hidden
          className="absolute right-0 bottom-0 h-[42svh] w-[74%] origin-bottom-right will-change-transform md:h-[58svh] md:w-[58%]"
          style={{ x: rightX, y: sideY, scale: sideScale }}
        >
          {layers.right}
        </motion.div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        <motion.div className="absolute inset-x-0 bottom-0 z-10 pb-10 md:pb-16" style={{ opacity: introOpacity, y: introY, pointerEvents: introEvents }}>
          {intro}
        </motion.div>

        <motion.p
          className="absolute inset-x-0 top-[30%] z-10 mx-auto max-w-4xl px-6 text-center text-[1.75rem] leading-[1.18] font-semibold tracking-[-0.03em] text-balance motion-reduce:hidden sm:text-4xl lg:text-5xl"
          style={{ opacity: statementOpacity, y: statementY }}
        >
          {words.map((word, index) => (
            <Word key={index} progress={progress} range={[0.3 + (index / words.length) * 0.4, 0.3 + ((index + 1) / words.length) * 0.4]}>
              {word}
            </Word>
          ))}
        </motion.p>

        <motion.div aria-hidden className="absolute inset-x-0 bottom-0 z-20 h-[30svh] will-change-transform md:h-[42svh]" style={{ y: nearY }}>
          {layers.near}
        </motion.div>
        <motion.div aria-hidden className="absolute inset-x-0 -bottom-px z-20 h-[22svh] will-change-transform md:h-[28svh]" style={{ y: groundY }}>
          {layers.ground}
        </motion.div>

        <motion.div
          aria-hidden
          className="absolute right-6 bottom-10 z-10 hidden flex-col items-center gap-3 text-[11px] tracking-[0.16em] text-white/75 uppercase motion-reduce:hidden md:flex lg:right-10"
          style={{ opacity: hintOpacity }}
        >
          <span className="[writing-mode:vertical-rl]">{scrollHint}</span>
          <span className="relative block h-9 w-px overflow-hidden bg-white/20">
            <span className="absolute inset-x-0 top-0 h-1/2 animate-[scroll-hint_1.8s_var(--ease-soft)_infinite] bg-white" />
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function Word({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: string }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return (
    <>
      <motion.span style={{ opacity }}>{children}</motion.span>{" "}
    </>
  );
}
