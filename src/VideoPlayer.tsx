import { useEffect, useState } from "react";
import { Play, LoaderCircle, RefreshCw } from "lucide-react";
import { media, videoPlayback, type Photo } from "./lib/api";

export default function VideoPlayer({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState("");
  const [poster, setPoster] = useState("");
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let object = "";
    void media(photo, "preview", controller.signal).then(blob => {
      if (!controller.signal.aborted) { object = URL.createObjectURL(blob); setPoster(object); }
    }).catch(() => {});
    return () => { controller.abort(); if (object) URL.revokeObjectURL(object); };
  }, [photo.id, photo.version]);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let object = "";
    setError(""); setProgress(0);
    void videoPlayback(photo, controller.signal, setProgress).then(blob => {
      if (!controller.signal.aborted) { object = URL.createObjectURL(blob); setUrl(object); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); if (object) URL.revokeObjectURL(object); };
  }, [requested, attempt, photo.id, photo.version]);
  return <div className="video-player">
    {url ? <video src={url} poster={poster} controls playsInline preload="metadata" aria-label={photo.name}
      onError={() => { setUrl(""); setError("이 기기에서 영상을 재생하지 못했어요. 원본을 다운로드해서 열어 주세요."); }} />
      : <>
        {poster && <img src={poster} alt="" />}
        <div className="video-playback-state">
          {error ? <><p role="alert">{error}</p><button className="secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={18} />다시 시도</button></>
            : requested ? <p role="status"><LoaderCircle className="spin" size={22} />영상 불러오는 중 · {progress}%</p>
              : <button className="video-play-button" onClick={() => setRequested(true)} aria-label="동영상 불러오기"><Play size={28} fill="currentColor" /></button>}
        </div>
      </>}
  </div>;
}
