import { useEffect, useRef, useState } from "react";
import { Map as VectorMap, Marker, LngLatBounds, setWorkerUrl } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import Supercluster from "supercluster";
import "maplibre-gl/dist/maplibre-gl.css";
import { api, media } from "./lib/api";
import { X, ChevronRight } from 'lucide-react';
import { naturalEarthStyle, naturalEarthLabels, type PlaceLabel } from "./lib/natural-earth";
setWorkerUrl(mapWorkerUrl);
type Point = { id: string; name?: string; latitude: number; longitude: number; takenAt: number; version: string };
function MapThumbnail({point}:{point:Point}){
  const [url,setUrl]=useState('');
  useEffect(()=>{const controller=new AbortController();let object='';void media(point,'thumb',controller.signal).then(blob=>{if(!controller.signal.aborted){object=URL.createObjectURL(blob);setUrl(object);}}).catch(()=>{});return()=>{controller.abort();if(object)URL.revokeObjectURL(object);};},[point.id,point.version]);
  return url?<img src={url} alt=""/>:<span className="map-thumb-placeholder"/>;
}
export default function MapView({ open, close }: { open: (id: string) => void; close: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [selection,setSelection]=useState<Point[]>([]);
  const [visible,setVisible]=useState(30);
  useEffect(() => {
    let map: VectorMap;
    try {
      map = new VectorMap({ container: host.current!, center: [127.8, 36.3], zoom: 6,
        style: naturalEarthStyle, attributionControl: false,
        minZoom: 1, maxZoom: 8, renderWorldCopies: false, maplibreLogo: false,
        locale: { "NavigationControl.ZoomIn": "지도 확대", "NavigationControl.ZoomOut": "지도 축소" } });
    } catch {
      setError("이 기기에서 지도를 표시하지 못했어요. 브라우저나 Android System WebView를 업데이트해 주세요.");
      return;
    }
    map.getCanvas().setAttribute("aria-label", "촬영 위치 지도");
    map.on("error", () => setError("지도 배경을 불러오지 못했어요. 연결을 확인해 주세요."));
    const markers: Marker[] = [];
    const labelMarkers: Marker[] = [];
    const controller = new AbortController();
    let places: PlaceLabel[] = [];
    const renderLabels = () => {
      for (const marker of labelMarkers) marker.remove();
      labelMarkers.length = 0;
      const zoom = map.getZoom(), bounds = map.getBounds();
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      const occupied: { x: number; y: number; halfWidth: number }[] = [];
      // Labels use the app's local Pretendard font, without a remote glyph service.
      for (const place of places) {
        if (place.kind === "country" ? zoom >= 5.5 : zoom < 3 || place.rank > zoom + 1) continue;
        if (!bounds.contains(place.position)) continue;
        const { x, y } = map.project(place.position);
        const halfWidth = Math.max(24, place.name.length * 6);
        const nearPhoto = markers.some(marker => {
          const point = map.project(marker.getLngLat());
          return Math.abs(point.x - x) < halfWidth + 30 && Math.abs(point.y - y) < 35;
        });
        const offset = nearPhoto ? 44 : place.kind === "city" ? 12 : 0;
        const labelY = y + offset;
        if (x < halfWidth || x > width - halfWidth || labelY < 70 || labelY > height - 40) continue;
        if (occupied.some(other => Math.abs(other.x - x) < other.halfWidth + halfWidth + 14 && Math.abs(other.y - labelY) < 30)) continue;
        occupied.push({ x, y: labelY, halfWidth });
        const label = document.createElement("span");
        label.className = `natural-earth-label is-${place.kind}`;
        label.textContent = place.name;
        label.setAttribute("aria-hidden", "true");
        labelMarkers.push(new Marker({ element: label, offset: [0, offset] }).setLngLat(place.position).addTo(map));
        if (labelMarkers.length >= 50) break;
      }
    };
    map.on("moveend", renderLabels);
    map.on("resize", renderLabels);
    void fetch(naturalEarthLabels, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("지도 지명을 불러오지 못했어요."); return response.json() as Promise<PlaceLabel[]>; })
      .then(labels => { if (!controller.signal.aborted) { places = labels; renderLabels(); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(host.current!);
    let disposed = false;
    void api<Point[]>("/map")
      .then((points) => {
        if (disposed) return;
        setCount(points.length);
        const index = new Supercluster<Point, Record<string, never>>({
          radius: 70,
          maxZoom: 8,
        }).load(
          points.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: p,
          })),
        );
        if (points.length)
          map.fitBounds(points.reduce((bounds, point) => bounds.extend([point.longitude, point.latitude]), new LngLatBounds()), {
            padding: 70, duration: 0,
            maxZoom: 7,
          });
        const render = () => {
          for (const marker of markers) marker.remove();
          markers.length = 0;
          const bounds = map.getBounds();
          const clusters = index.getClusters(
            [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
            Math.floor(map.getZoom()),
          );
          for (const feature of clusters) {
            const props = feature.properties;
            const clustered = "cluster" in props && props.cluster;
            const count = clustered ? props.point_count : 1;
            const button = document.createElement("button");
            button.className = "map-photo-marker";
            button.style.width = button.style.height = count > 10 ? "48px" : "44px";
            button.setAttribute("aria-label", clustered ? `${count}장 · 이 위치의 사진 보기` : "사진 열기");
            const label = document.createElement("span");
            label.textContent = String(count);
            button.append(label);
            button.addEventListener("click", () => {
              if (clustered) {
                setSelection(index.getLeaves(props.cluster_id,Infinity).map(p=>p.properties));
                setVisible(30);
              }
              else open(props.id);
            });
            markers.push(new Marker({ element: button }).setLngLat([feature.geometry.coordinates[0], feature.geometry.coordinates[1]]).addTo(map));
          }
          renderLabels();
        };
        map.on("moveend", render);
        render();
      })
      .catch((e) => { if (!disposed) setError(e.message); });
    return () => {
      disposed = true;
      controller.abort();
      observer.disconnect();
      for (const marker of markers) marker.remove();
      for (const marker of labelMarkers) marker.remove();
      map.remove();
    };
  }, [open]);
  return (
    <div className="map-wrap">
      <div ref={host} className="map-canvas" aria-label="촬영 위치 지도" />
      <div className="map-caption">
        {count === null
          ? "촬영 위치를 불러오는 중"
          : count === 0
            ? "위치 정보가 담긴 사진을 연결하면 여기에 표시돼요."
            : `위치가 있는 사진 ${count.toLocaleString()}장`}
        {error && <p role="status">{error}</p>}
      </div>
      {selection.length>0&&<aside className="map-selection" aria-label="이 위치의 사진"><header><h2>이 위치의 사진 <span>{selection.length}장</span></h2><button className="icon-button" aria-label="위치 사진 목록 닫기" onClick={close}><X size={18}/></button></header><div>{selection.slice(0,visible).map(p=><button className="map-selection-item" key={p.id} onClick={()=>open(p.id)}><MapThumbnail point={p}/><span>{p.name||'사진'}<small>{new Date(p.takenAt).toLocaleDateString('ko-KR')}</small></span><ChevronRight size={16}/></button>)}{visible<selection.length&&<button className="secondary" onClick={()=>setVisible(n=>n+30)}>30장 더 보기</button>}</div></aside>}
    </div>
  );
}
