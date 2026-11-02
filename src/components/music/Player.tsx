"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { motionVars } from "@/components/motion/style";

type Item = {
  id: string;
  title: string;
  /** Public preview URL. Null means nothing authorised for playback. */
  url: string | null;
  durationSeconds: number | null;
};

/**
 * In-page preview player. It only ever plays a file the admin has published to
 * the public bucket; with no file it says so instead of pretending to play.
 */
export function Player({ tracks }: { tracks: Item[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playable = tracks.filter((t) => t.url);
  const current = playable[at] ?? playable[0] ?? null;
  const src = current?.url ?? null;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setTime(el.currentTime);
    // A new src always re-fires loadedmetadata, so the readout is reset from the
    // element itself instead of an effect that guesses when the source changed.
    const onMeta = () => {
      setDuration(el.duration || 0);
      setTime(el.currentTime);
    };
    const onEnd = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  if (!src) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-ash bg-ink-raised p-5 text-sm">
        <p className="flex items-center gap-2 font-semibold text-mist">
          <Play size={15} /> No preview published
        </p>
        <p className="mt-2 leading-relaxed text-smoke">
          Audio only plays here when {""}
          <strong className="text-mist">{tracks.length}</strong> authorised preview file
          {tracks.length === 1 ? "" : "s"} exists{tracks.length === 1 ? "" : "s"} in the
          public bucket. Nothing is simulated. Use the streaming links to listen.
        </p>
      </div>
    );
  }

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  const step = (dir: 1 | -1) => {
    if (playable.length < 2) return;
    setAt((i) => (i + dir + playable.length) % playable.length);
  };

  return (
    <div className="mt-5 rounded-lg border border-charcoal bg-ink-raised p-4">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause preview" : "Play preview"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-ink"
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        {playable.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="Previous preview" className="text-smoke hover:text-gold">
              <SkipBack size={16} />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next preview" className="text-smoke hover:text-gold">
              <SkipForward size={16} />
            </button>
          </>
        )}

        <span className="min-w-0 flex-1 truncate text-sm text-mist">
          {playing && (
            <span className="rk-bars mr-2 align-middle" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <i key={i} style={motionVars({ "--rk-i": i })} />
              ))}
            </span>
          )}
          {current?.title}
        </span>

        <button
          type="button"
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            el.muted = !muted;
            setMuted(!muted);
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          className="text-smoke hover:text-gold"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[0.6875rem] text-smoke">
        <span className="tabular-nums">{fmt(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || current?.durationSeconds || 0}
          value={time}
          onChange={(e) => {
            const el = audioRef.current;
            if (!el) return;
            el.currentTime = Number(e.target.value);
            setTime(el.currentTime);
          }}
          aria-label="Seek"
          className="h-1 flex-1 accent-gold"
        />
        <span className="tabular-nums">
          {fmt(duration || current?.durationSeconds || 0)}
        </span>
      </div>
    </div>
  );
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
