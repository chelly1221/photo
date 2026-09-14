import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Images, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { AuthBrowser, authenticationUrl } from "./lib/auth-browser";
import { native } from "./lib/backup";
import { ensureTailscale, suspendTailscale, type TailState } from "./lib/tailscale";

type Phase = "idle" | "preparing" | "waiting" | "cancelled" | "error";

export default function ConnectionScreen({ tail }: { tail: TailState }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [popupBlocked, setPopupBlocked] = useState(false);
  const attempt = useRef<AbortController | null>(null);
  const popup = useRef<Window | null>(null);
  const openedUrl = useRef("");
  const busy = phase === "preparing" || phase === "waiting";

  const closeWindow = () => {
    popup.current?.close();
    popup.current = null;
    if (native) void AuthBrowser.close().catch(() => {});
  };
  const cancel = () => {
    attempt.current?.abort();
    attempt.current = null;
    closeWindow();
    setPhase("cancelled");
    setPopupBlocked(false);
  };
  useEffect(() => () => {
    attempt.current?.abort();
    closeWindow();
  }, []);
  useEffect(() => {
    if (!busy) return;
    const closed = () => {
      if (!attempt.current || tail.state === "Running") return;
      cancel();
    };
    window.addEventListener("photoAuthClosed", closed);
    const timer = native ? undefined : setInterval(() => {
      // An identity provider may sever the window reference using COOP. Only
      // treat it as a manual return once the user is back in this app.
      if (document.hasFocus() && popup.current?.closed) closed();
    }, 400);
    return () => {
      clearInterval(timer);
      window.removeEventListener("photoAuthClosed", closed);
    };
  }, [busy, tail.state]);

  useEffect(() => {
    if (!busy || !tail.loginUrl || !attempt.current || openedUrl.current === tail.loginUrl) return;
    const controller = attempt.current;
    try {
      const url = authenticationUrl(tail.loginUrl);
      openedUrl.current = tail.loginUrl;
      setPhase("waiting");
      if (native) {
        void AuthBrowser.open({ url }).catch(error => {
          if (controller.signal.aborted) return;
          controller.abort();
          attempt.current = null;
          setPhase("error");
          setMessage(error.message);
        });
      } else if (popup.current && !popup.current.closed) {
        popup.current.location.replace(url);
      } else {
        setPopupBlocked(true);
      }
    } catch (error) {
      controller.abort();
      attempt.current = null;
      closeWindow();
      setPhase("error");
      setMessage((error as Error).message);
    }
  }, [busy, tail.loginUrl]);

  const connect = () => {
    if (attempt.current) return;
    const controller = new AbortController();
    attempt.current = controller;
    openedUrl.current = "";
    setMessage("");
    setPopupBlocked(false);
    setPhase("preparing");
    // Reserve the web window during the tap so asynchronous login URLs aren't blocked.
    if (!native) {
      popup.current = window.open("about:blank", "photo-auth", "popup,width=480,height=720");
      if (popup.current) {
        popup.current.opener = null;
        popup.current.document.title = "보관함 연결";
        popup.current.document.body.textContent = "인증 화면을 준비하고 있어요…";
        popup.current.document.body.style.cssText = "margin:0;padding:40px;background:#111;color:#ededed;font:16px system-ui";
      }
    }
    if (tail.state === "Error") suspendTailscale();
    void ensureTailscale(controller.signal).catch(error => {
      if (controller.signal.aborted) return;
      controller.abort();
      attempt.current = null;
      closeWindow();
      setPhase("error");
      setMessage(error.message);
    });
  };

  return <div className="connection-page">
    <header className="connection-brand"><Images size={22} aria-hidden="true" /><span>사진</span></header>
    <main className="connection-main">
      <div className="connection-symbol" aria-hidden="true">
        {busy ? <LoaderCircle size={38} strokeWidth={1.5} className="spin" /> : <Images size={38} strokeWidth={1.5} />}
      </div>
      <h1>{busy ? "보관함 연결 중" : "보관함 연결"}</h1>
      <p className="connection-description">{busy ? "계정 인증을 마치면 사진이 열려요." : "내 NAS의 사진을 여기에서 만나보세요."}</p>
      <div className="connection-actions">
        {busy ? <>
          <p className="connection-progress" role="status">{phase === "preparing" ? "연결을 준비하고 있어요…" : popupBlocked ? "인증 창이 차단되었어요." : "인증을 기다리고 있어요…"}</p>
          {popupBlocked && <button className="primary" onClick={() => {
            try {
              popup.current = window.open(authenticationUrl(tail.loginUrl), "photo-auth", "popup,width=480,height=720");
              if (popup.current) { popup.current.opener = null; setPopupBlocked(false); }
            } catch (error) { setMessage((error as Error).message); }
          }}>인증 창 열기<ArrowRight size={18} /></button>}
          <button className="connection-cancel" onClick={cancel}><X size={16} />취소</button>
        </> : <button className="primary" onClick={connect}>{phase === "idle" ? "연결하기" : "다시 연결"}<ArrowRight size={18} /></button>}
        {phase === "cancelled" && <p className="connection-feedback" role="status">연결을 취소했어요. 준비되면 다시 연결하세요.</p>}
        {message && <p className="connection-feedback" role="alert">{message}</p>}
      </div>
      <p className="connection-privacy"><ShieldCheck size={15} aria-hidden="true" />Tailscale 계정으로 안전하게 연결해요.</p>
    </main>
    <footer className="connection-footer">{!native && <a href="/downloads/photo-0.5.3.apk"><Download size={16} />Android 앱 다운로드</a>}</footer>
  </div>;
}
