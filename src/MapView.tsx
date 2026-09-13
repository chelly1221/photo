import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import Supercluster from "supercluster";
import "leaflet/dist/leaflet.css";
import { api, media } from "./lib/api";
import { X, ChevronRight } from 'lucide-react';
type Point = { id: string; name?: string; latitude: number; longitude: number; takenAt: number; version: string };
function MapThumbnail({point}:{point:Point}){
  const [url,setUrl]=useState('');
  useEffect(()=>{const controller=new AbortController();let object='';void media(point,'thumb',controller.signal).then(blob=>{if(!controller.signal.aborted){object=URL.createObjectURL(blob);setUrl(object);}}).catch(()=>{});return()=>{controller.abort();if(object)URL.revokeObjectURL(object);};},[point.id,point.version]);
  return url?<img src={url} alt=""/>:<span className="map-thumb-placeholder"/>;
}
export default function MapView({ open }: { open: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [selection,setSelection]=useState<Point[]>([]);
  const [visible,setVisible]=useState(30);
  useEffect(() => {
    const map = L.map(host.current!, { zoomControl: false }).setView([36.3, 127.8], 6);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
      .addTo(map)
      .on("tileerror", () => setError("지도 배경을 불러오지 못했어요. 사진 위치는 계속 표시돼요."));
    const layer = L.layerGroup().addTo(map);
    let disposed = false;
    void api<Point[]>("/map")
      .then((points) => {
        if (disposed) return;
        setCount(points.length);
        const index = new Supercluster<Point, Record<string, never>>({
          radius: 70,
          maxZoom: 20,
        }).load(
          points.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: p,
          })),
        );
        if (points.length)
          map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), {
            padding: [70, 70],
            maxZoom: 13,
          });
        const render = () => {
          layer.clearLayers();
          const bounds = map.getBounds();
          const clusters = index.getClusters(
            [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
            Math.floor(map.getZoom()),
          );
          for (const feature of clusters) {
            const props = feature.properties;
            const clustered = "cluster" in props && props.cluster;
            const count = clustered ? props.point_count : 1;
            const icon = L.divIcon({
              className: "map-photo-marker",
              html: `<span>${count}</span>`,
              iconSize: count > 10 ? [54, 54] : [42, 42],
            });
            const marker = L.marker(
              [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
              {
                icon,
                keyboard: true,
                title: clustered ? `${count}장 · 이 위치의 사진 보기` : "사진 열기",
              },
            ).addTo(layer);
            marker.on("click", () => {
              if (clustered) {
                setSelection(index.getLeaves(props.cluster_id,Infinity).map(p=>p.properties));
                setVisible(30);
              }
              else open(props.id);
            });
          }
        };
        map.on("moveend", render);
        render();
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
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
      {selection.length>0&&<aside className="map-selection" aria-label="이 위치의 사진"><header><h2>이 위치의 사진 <span>{selection.length}장</span></h2><button className="icon-button" aria-label="위치 사진 목록 닫기" onClick={()=>setSelection([])}><X size={18}/></button></header><div>{selection.slice(0,visible).map(p=><button className="map-selection-item" key={p.id} onClick={()=>open(p.id)}><MapThumbnail point={p}/><span>{p.name||'사진'}<small>{new Date(p.takenAt).toLocaleDateString('ko-KR')}</small></span><ChevronRight size={16}/></button>)}{visible<selection.length&&<button className="secondary" onClick={()=>setVisible(n=>n+30)}>30장 더 보기</button>}</div></aside>}
    </div>
  );
}
