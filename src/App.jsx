import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

// 1. Inisialisasi Protokol PMTiles
let protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// 2. Fungsi Pembersih Angka SLA
const parseSLA = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  let num = val;
  if (typeof val !== 'number') {
    const cleaned = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
    num = parseFloat(cleaned);
  }
  if (isNaN(num)) return 0;
  if (num > 1) num = num / 100;
  return num;
};

// ==========================================================
// KOMPONEN: CUSTOM SINGLE SELECT DROPDOWN (TEMA SERAGAM POPOVER)
// ==========================================================
const CustomSelect = ({ value, onChange, options, placeholder, disabled, className, menuUp }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedOptions = options.map(opt => typeof opt === 'object' ? opt : { value: opt, label: opt });
  const currentLabel = normalizedOptions.find(o => o.value === value)?.label || placeholder;

  return (
    <div className={`relative ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`} ref={containerRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-300 shadow-inner flex justify-between items-center w-full text-left cursor-pointer hover:border-slate-600 transition"
      >
        <span className="truncate text-xs font-semibold pr-2">{currentLabel}</span>
        <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">{isOpen ? (menuUp ? '▼' : '▲') : (menuUp ? '▲' : '▼')}</span>
      </button>

      {isOpen && (
        <div className={`absolute left-0 w-full min-w-full bg-slate-900 border border-slate-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] p-1 z-50 max-h-48 overflow-y-auto ${menuUp ? 'bottom-full mb-1 border-b-2 border-b-emerald-500' : 'top-full mt-1 border-t-2 border-t-emerald-500'} custom-scrollbar`}>
          <div 
            className={`px-2 py-1.5 hover:bg-slate-850 rounded cursor-pointer text-xs transition-colors mb-1 ${!value ? 'bg-slate-800/50 text-emerald-400 font-bold' : 'text-slate-400 font-semibold'}`}
            onClick={() => { onChange(''); setIsOpen(false); }}
          >
            {placeholder}
          </div>
          {normalizedOptions.map(opt => (
            <div 
              key={opt.value} 
              className={`flex items-center px-2 py-1.5 hover:bg-slate-850 rounded cursor-pointer text-xs transition-colors ${value === opt.value ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-300 font-semibold'}`}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
            >
              <span className="truncate" title={opt.label}>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================================
// KOMPONEN: LINE CHART TREND SLA (KUSTOM DENGAN HOVER TOOLTIP)
// ==========================================================
const TrendChart = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) return null;

  if (data.length === 1) {
    return (
      <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-800 shadow-xl w-[320px] pointer-events-auto">
         <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 flex justify-between">
           <span>TREND BULANAN AVAILABILITY</span>
           <span className="text-emerald-400 font-mono font-bold drop-shadow-md">{data[0].avg.toFixed(2)}%</span>
         </div>
         <div className="text-[10px] text-slate-500 text-center py-4 italic font-medium border border-dashed border-slate-700 rounded bg-slate-950/50 mt-2">Data baru 1 periode ({data[0].month})</div>
      </div>
    );
  }

  // FIX 1: Sesuaikan lebar SVG karena container memiliki padding (320 - 16 - 16 = 288)
  const width = 288;
  const height = 90;
  const paddingX = 15;
  const paddingTop = 10;
  const paddingBottom = 25; 

  const minAvg = Math.min(...data.map(d => d.avg));
  const maxAvg = Math.max(...data.map(d => d.avg));
  const range = (maxAvg - minAvg) || 1;
  const rangePadding = range * 0.2;
  const adjustedMin = minAvg - rangePadding;
  const adjustedMax = maxAvg + rangePadding;
  const adjustedRange = adjustedMax - adjustedMin;

  const getX = (i) => paddingX + (i / (data.length - 1)) * (width - 2 * paddingX);
  const getY = (val) => height - paddingBottom - ((val - adjustedMin) / adjustedRange) * (height - paddingTop - paddingBottom);

  const points = data.map((d, i) => `${getX(i)},${getY(d.avg)}`).join(' ');

  return (
    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-800 shadow-xl w-[320px] pointer-events-auto group relative">
       <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 flex justify-between">
         <span>TREND BULANAN AVAILABILITY</span>
         <span className="text-emerald-400 font-mono font-bold drop-shadow-md">{data[data.length-1].avg.toFixed(2)}%</span>
       </div>

       <div className="relative">
         <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" className="opacity-80 group-hover:opacity-100 transition-opacity drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
            {data.map((d, i) => {
               const x = getX(i);
               const y = getY(d.avg);
               const isHovered = hoverIdx === i;
               return (
                 <g key={i} className="cursor-crosshair" onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                   <circle cx={x} cy={y} r={isHovered ? "6" : "4"} fill={isHovered ? "#34d399" : "#0f172a"} stroke="#10b981" strokeWidth={isHovered ? "2" : "1.5"} className="transition-all duration-200" />
                   {/* Lingkaran transparan besar agar kursor lebih mudah memicu hover */}
                   <circle cx={x} cy={y} r="15" fill="transparent" />
                   {/* Label Tiap Bulan */}
                   <text x={x} y={height - 5} fontSize="9" fontWeight="bold" fill={isHovered ? "#34d399" : "#64748b"} textAnchor="middle" className="font-mono transition-colors duration-200 pointer-events-none">
                     {d.month.split('/')[1]}
                   </text>
                 </g>
               )
            })}
         </svg>

         {hoverIdx !== null && (
           <div
             className="absolute bg-slate-900/95 backdrop-blur-md border border-slate-700 p-2.5 rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 text-[10px] pointer-events-none transform -translate-y-full"
             style={{ 
               left: `${getX(hoverIdx)}px`, 
               top: `${getY(data[hoverIdx].avg) - 10}px`,
               // FIX 2: Pergeseran dinamis agar tooltip tidak nabrak batas container/layar
               transform: `translate(${hoverIdx === data.length - 1 ? '-85%' : hoverIdx === 0 ? '-15%' : '-50%'}, -100%)`
             }}
           >
             {/* Segitiga panah ke bawah */}
             <div 
               className="absolute top-full -mt-[1px] border-solid border-t-slate-700 border-t-8 border-x-transparent border-x-8 border-b-0" 
               style={{ 
                 left: hoverIdx === data.length - 1 ? '85%' : hoverIdx === 0 ? '15%' : '50%',
                 transform: 'translateX(-50%)'
               }}
             />
             <h3 className="text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 pb-1 mb-1.5 text-center">{data[hoverIdx].month}</h3>
             <div className="flex justify-between items-center gap-4">
               {/* FIX 3: Teks SLA diubah menjadi AV */}
               <span className="font-semibold drop-shadow-md text-emerald-400">• AV</span>
               <span className="text-slate-200 font-mono font-bold text-sm">{data[hoverIdx].avg.toFixed(2)}%</span>
             </div>
           </div>
         )}
       </div>
    </div>
  );
};

// ==========================================================
// KOMPONEN: MINI DONUT CHART (PIE CHART) DENGAN LEGENDA
// ==========================================================
const DonutStat = ({ title, data }) => {
  const colors = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#a855f7'];
  let cumulative = 0;
  
  const gradient = data.map((d, i) => {
    const start = cumulative;
    cumulative += parseFloat(d.pct);
    return `${colors[i % colors.length]} ${start}% ${cumulative}%`;
  }).join(', ');

  return (
    <div className="flex flex-col items-center w-1/4 mt-[-4px]">
      <h4 className="text-[9px] uppercase tracking-wider text-slate-500 font-bold text-center h-6 leading-tight flex items-center justify-center">{title}</h4>
      
      <div 
        className="relative w-10 h-10 mt-0 mb-1.5 flex items-center justify-center rounded-full cursor-help hover:scale-110 transition-transform shadow-[0_0_10px_rgba(0,0,0,0.5)] group/chart flex-shrink-0" 
        style={{ background: `conic-gradient(${gradient || '#1e293b 0% 100%'})` }}
      >
         <div className="w-6 h-6 bg-slate-900 rounded-full shadow-inner pointer-events-none" />
         
         {/* TOOLTIP HOVER */}
         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max min-w-[130px] bg-slate-900/95 backdrop-blur-md border border-slate-700 p-2.5 rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.8)] opacity-0 group-hover/chart:opacity-100 transition-opacity duration-200 pointer-events-none z-50 text-[10px]">
           <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-solid border-t-slate-700 border-t-8 border-x-transparent border-x-8 border-b-0" />
           <h3 className="text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 pb-1 mb-1.5">{title} Details</h3>
           {data.length > 0 ? data.map((d, i) => (
             <div key={d.name} className="flex justify-between items-center gap-4 mb-1 last:mb-0">
               <span className="font-semibold drop-shadow-md" style={{ color: colors[i % colors.length] }}>• {d.name}</span>
               <span className="text-slate-300 font-mono font-medium">{d.count} <span className="text-slate-500 text-[9px]">({d.pct}%)</span></span>
             </div>
           )) : <div className="text-slate-500 text-center italic">Tidak ada data</div>}
         </div>
      </div>
      
      {/* LEGENDA WARNA DITENGAHKAN */}
      <div className="flex w-full justify-center mt-0.5">
        <div className="flex flex-col gap-[3px] overflow-hidden w-[95%] pl-2 xl:pl-3">
          {data.length > 0 ? (
            data.slice(0, 3).map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 w-full text-[8px] leading-none" title={`${d.name}: ${d.pct}%`}>
                <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                <span className="truncate text-slate-400 font-medium">{d.name}</span>
              </div>
            ))
          ) : (
            <span className="text-[8px] text-slate-600 text-center w-full">-</span>
          )}
          
          {/* Indikator jika ada lebih dari 3 item */}
          {data.length > 3 && (
            <div className="text-[7px] text-slate-600 font-medium italic text-left pl-3">
              +{data.length - 3} lainnya
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  const [rawData, setRawData] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [areaBounds, setAreaBounds] = useState({});
  
  const [clickedSite, setClickedSite] = useState(null);
  const [clickedRegion, setClickedRegion] = useState(null);

  const [isFilterOpen, setIsFilterOpen] = useState(false); 
  const [isDetailOpen, setIsDetailOpen] = useState(false); 
  const [isHierarchyOpen, setIsHierarchyOpen] = useState(false); 

  const [selectedModal, setSelectedModal] = useState(null); 
  const [currentBasemap, setCurrentBasemap] = useState('dark');
  const [styleLoaded, setStyleLoaded] = useState(0);

  const [searchId, setSearchId] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStructure, setSelectedStructure] = useState('');

  const [selectedProviders, setSelectedProviders] = useState([]);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);

  // STATE BARU: DUAL RANGE SLIDER FILTER
  const [selectedYear, setSelectedYear] = useState('');
  const [monthRange, setMonthRange] = useState([1, 1]);

  const [selProv, setSelProv] = useState('');
  const [selKab, setSelKab] = useState('');
  const [selKec, setSelKec] = useState('');
  const [selKel, setSelKel] = useState('');

  useEffect(() => {
    fetch('./titik_site.geojson')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.features) {
          setRawData(data.features);
        }
      })
      .catch((err) => console.error("Gagal memuat basis data titik:", err));

    fetch('./bounds.json')
      .then((res) => res.json())
      .then((data) => setAreaBounds(data))
      .catch((err) => console.error("Gagal memuat koordinat poligon:", err));
  }, []);

  const uniqueMonths = useMemo(() => [...new Set(rawData.map(f => f.properties.monthReportv2))].filter(Boolean).sort(), [rawData]);
  const uniqueYears = useMemo(() => {
    const years = new Set(uniqueMonths.map(m => m.split('/')[0]));
    return [...years].sort();
  }, [uniqueMonths]);

  // Set nilai default ke bulan terbaru saat data dimuat
  useEffect(() => {
    if (uniqueMonths.length > 0 && !selectedYear) {
      const latest = uniqueMonths[uniqueMonths.length - 1]; 
      const [year, month] = latest.split('/');
      setSelectedYear(year);
      setSelectedMonth(parseInt(month, 10)); 
    }
  }, [uniqueMonths, selectedYear]);

  // Generate string bulan tunggal
  const activeMonths = useMemo(() => {
    if(!selectedYear) return [];
    return [`${selectedYear}/${String(selectedMonth).padStart(2, '0')}`];
  }, [selectedYear, selectedMonth]);

  const hasData = useMemo(() => {
    return activeMonths.some(m => uniqueMonths.includes(m));
  }, [activeMonths, uniqueMonths]);

  const displayRange = `${selectedYear}/${String(selectedMonth).padStart(2, '0')}`;

  const uniqueTypes = useMemo(() => [...new Set(rawData.map(f => f.properties.type_koneksi))].filter(Boolean).sort(), [rawData]);
  const uniqueStructures = useMemo(() => [...new Set(rawData.map(f => f.properties.STRUKTUR))].filter(Boolean).sort(), [rawData]);

  const uniqueProviders = useMemo(() => {
    return [...new Set(rawData.map(f => f.properties.Provider))]
      .filter(p => p && String(p).trim() !== '' && String(p).trim() !== '-' && String(p).toUpperCase() !== 'N/A')
      .sort();
  }, [rawData]);

  const listProvinsi = useMemo(() => {
    const provs = new Set();
    Object.keys(areaBounds).forEach(k => { const p = k.split('||'); if (p[0]) provs.add(p[0]); });
    return [...provs].sort();
  }, [areaBounds]);

  const listKabupaten = useMemo(() => {
    if (!selProv) return [];
    const kabs = new Set();
    Object.keys(areaBounds).forEach(k => { const p = k.split('||'); if (p[0] === selProv && p.length > 1) kabs.add(p[1]); });
    return [...kabs].sort();
  }, [areaBounds, selProv]);

  const listKecamatan = useMemo(() => {
    if (!selKab) return [];
    const kecs = new Set();
    Object.keys(areaBounds).forEach(k => { const p = k.split('||'); if (p[0] === selProv && p[1] === selKab && p.length > 2) kecs.add(p[2]); });
    return [...kecs].sort();
  }, [areaBounds, selProv, selKab]);

  const listKelurahan = useMemo(() => {
    if (!selKec) return [];
    const kels = new Set();
    Object.keys(areaBounds).forEach(k => { const p = k.split('||'); if (p[0] === selProv && p[1] === selKab && p[2] === selKec && p.length > 3) kels.add(p[3]); });
    return [...kels].sort();
  }, [areaBounds, selProv, selKab, selKec]);

  const handleHierarchyChange = (level, value) => {
    if (level === 'prov') { setSelProv(value); setSelKab(''); setSelKec(''); setSelKel(''); }
    else if (level === 'kab') { setSelKab(value); setSelKec(''); setSelKel(''); }
    else if (level === 'kec') { setSelKec(value); setSelKel(''); }
    else if (level === 'kel') { setSelKel(value); }
  };

  useEffect(() => {
    if (!mapReady || !map.current || Object.keys(areaBounds).length === 0) return;
    
    let key = '';
    if (selKel) key = `${selProv}||${selKab}||${selKec}||${selKel}`;
    else if (selKec) key = `${selProv}||${selKab}||${selKec}`;
    else if (selKab) key = `${selProv}||${selKab}`;
    else if (selProv) key = selProv;

    if (!key) {
      map.current.flyTo({ center: [118.0, -2.5], zoom: 4.5, duration: 1500 });
      return;
    }

    const bounds = areaBounds[key];
    if (bounds) {
      const [minLng, minLat, maxLng, maxLat] = bounds;
      map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 14, duration: 1500 });
    }
  }, [selProv, selKab, selKec, selKel, mapReady, areaBounds]);

  const filteredFeatures = useMemo(() => {
    if (!hasData) return [];

    return rawData.filter((feature) => {
      const props = feature.properties;
      
      // Filter Multi-Month Range
      if (activeMonths.length > 0 && !activeMonths.includes(props.monthReportv2)) return false;
      
      if (selectedType && props.type_koneksi !== selectedType) return false;
      if (selectedStructure && props.STRUKTUR !== selectedStructure) return false;
      
      if (selectedProviders.length > 0) {
        const pStr = props.Provider ? String(props.Provider).trim() : '';
        if (!selectedProviders.includes(pStr)) return false;
      }

      if (searchId) {
        const term = searchId.toLowerCase();
        const matchId = props.kodesite && String(props.kodesite).toLowerCase().includes(term);
        const matchName = props["NAMA SITE"] && String(props["NAMA SITE"]).toLowerCase().includes(term);
        if (!matchId && !matchName) return false;
      }
      
      const pProv = props.nama_prop || props.PROVINSI || props.provinsi;
      const pKab = props.nama_kab || props.KABUPATEN || props.kabupaten || props["KABUPATEN/KOTA"];
      const pKec = props.nama_kec || props.KECAMATAN || props.kecamatan;
      const pKel = props.nama_kel || props.KELURAHAN || props.kelurahan || props.DESA;

      if (selProv && pProv !== selProv) return false;
      if (selKab && pKab !== selKab) return false;
      if (selKec && pKec !== selKec) return false;
      if (selKel && pKel !== selKel) return false;

      return true;
    });
  }, [rawData, searchId, selectedType, selectedProviders, selectedStructure, activeMonths, hasData, selProv, selKab, selKec, selKel]);

  const metrics = useMemo(() => {
    const total = filteredFeatures.length;
    const online = filteredFeatures.filter(f => f.properties.status_link === 'AKTIF').length;
    const offline = filteredFeatures.filter(f => f.properties.status_link === 'TIDAK AKTIF').length;
    const totalSLA = filteredFeatures.reduce((acc, f) => acc + parseSLA(f.properties.AV), 0);
    const avgSLA = total > 0 ? (totalSLA / total) * 100 : 0;
    
    const onlinePct = total > 0 ? ((online / total) * 100).toFixed(1) : 0;
    const offlinePct = total > 0 ? ((offline / total) * 100).toFixed(1) : 0;

    return { total, online, offline, avgSLA, onlinePct, offlinePct };
  }, [filteredFeatures]);

  const trendData = useMemo(() => {
    // Trendline tidak terpengaruh oleh slider range waktu, agar selalu menunjukkan seluruh tahun
    const spatialFiltered = rawData.filter(f => {
      const props = f.properties;
      if (selectedType && props.type_koneksi !== selectedType) return false;
      if (selectedStructure && props.STRUKTUR !== selectedStructure) return false;
      
      if (selectedProviders.length > 0) {
        const pStr = props.Provider ? String(props.Provider).trim() : '';
        if (!selectedProviders.includes(pStr)) return false;
      }
      
      const pProv = props.nama_prop || props.PROVINSI || props.provinsi;
      const pKab = props.nama_kab || props.KABUPATEN || props.kabupaten || props["KABUPATEN/KOTA"];
      const pKec = props.nama_kec || props.KECAMATAN || props.kecamatan;
      const pKel = props.nama_kel || props.KELURAHAN || props.kelurahan || props.DESA;

      if (selProv && pProv !== selProv) return false;
      if (selKab && pKab !== selKab) return false;
      if (selKec && pKec !== selKec) return false;
      if (selKel && pKel !== selKel) return false;

      return true;
    });

    const grouped = {};
    spatialFiltered.forEach(f => {
      const m = f.properties.monthReportv2;
      if (!m) return;
      if (!grouped[m]) grouped[m] = { sum: 0, count: 0 };
      grouped[m].sum += parseSLA(f.properties.AV);
      grouped[m].count += 1;
    });

    return Object.keys(grouped).sort().map(m => ({
      month: m,
      avg: (grouped[m].sum / grouped[m].count) * 100
    }));
  }, [rawData, selectedType, selectedStructure, selectedProviders, selProv, selKab, selKec, selKel]);

  const summaryData = useMemo(() => {
    const total = filteredFeatures.length;
    if (total === 0) return { tipe: [], provider: [], struktur: [], bandwidth: [] };

    const countBy = (propName, formatter = v => v) => {
      const counts = {};
      filteredFeatures.forEach(f => {
        let val = f.properties[propName];
        if (!val || String(val).trim() === '') val = 'N/A';
        val = formatter(val);
        counts[val] = (counts[val] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count, pct: ((count / total) * 100).toFixed(1) }))
        .sort((a, b) => b.count - a.count); 
    };

    const formatStruktur = (val) => {
      if (val === 'KAB-KOTA') return 'KABUPATEN / KOTA';
      if (val === 'KELURAHAN') return 'KELURAHAN / DESA';
      return val;
    };

    return {
      tipe: countBy('type_koneksi'),
      provider: countBy('Provider'),
      struktur: countBy('STRUKTUR', formatStruktur),
      bandwidth: countBy('bandwidth')
    };
  }, [filteredFeatures]);

  useEffect(() => {
    if (map.current) return;

    const styles = {
      dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      osm: {
        version: 8,
        sources: { 'osm-tiles': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OSM' } },
        layers: [{ id: 'osm-layer', type: 'raster', source: 'osm-tiles' }]
      }
    };

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styles[currentBasemap], 
      center: [118.0, -2.5],
      zoom: 4.5,
    });

    const loadLayers = () => {
      if (!map.current.getSource('batas-desa')) {
        // 1. Pastikan baris baseUrl ini ada di dalam useEffect tempat load layers
        const baseUrl = window.location.href.split('#')[0].replace(/\/$/, '') + '/';

        // 2. Ubah URL pmtiles menjadi seperti di bawah ini
        map.current.addSource('batas-desa', { 
          type: 'vector', 
          url: 'pmtiles://https://github.com/rizkianandageo/monitoring-jarkomdat/releases/download/v1.0.0/batas_administrasi.pmtiles' 
        });
        map.current.addLayer({
          id: 'batas-desa-fill', type: 'fill', source: 'batas-desa', 'source-layer': 'batas_administrasi',
          paint: { 'fill-color': '#111827', 'fill-opacity': currentBasemap === 'dark' ? 0.55 : 0.25 }
        });
        map.current.addLayer({
          id: 'batas-desa-line', type: 'line', source: 'batas-desa', 'source-layer': 'batas_administrasi',
          paint: { 'line-color': currentBasemap === 'dark' ? '#334155' : '#64748b', 'line-width': 0.2, 'line-opacity': 0.6 }
        });
      }

      if (!map.current.getSource('titik-site')) {
        map.current.addSource('titik-site', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.current.addLayer({
          id: 'titik-site-layer', type: 'circle', source: 'titik-site',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 12, 10],
            'circle-color': ['match', ['get', 'status_link'], 'AKTIF', '#10b981', 'TIDAK AKTIF', '#ef4444', '#3b82f6'],
            'circle-stroke-width': 1.5, 'circle-stroke-color': '#0f172a'
          }
        });
      }
      setStyleLoaded(Date.now());
    };

    map.current.on('load', loadLayers);
    map.current.on('style.load', loadLayers);

    map.current.on('click', 'titik-site-layer', (e) => {
      if (e.features.length > 0) {
        setClickedSite(e.features[0].properties);
        setClickedRegion(null); 
        setIsDetailOpen(true);  
      }
    });

    map.current.on('click', 'batas-desa-fill', (e) => {
      const titikFeatures = map.current.queryRenderedFeatures(e.point, { layers: ['titik-site-layer'] });
      if (titikFeatures.length > 0) return;

      if (e.features.length > 0) {
        setClickedRegion(e.features[0].properties);
        setClickedSite(null); 
        setIsDetailOpen(true); 
      }
    });

    map.current.on('mousemove', (e) => {
      const features = map.current.queryRenderedFeatures(e.point, { layers: ['titik-site-layer', 'batas-desa-fill'] });
      if (features.length > 0) { map.current.getCanvas().style.cursor = 'pointer'; } 
      else { map.current.getCanvas().style.cursor = ''; }
    });

    setMapReady(true);
  }, []);

  useEffect(() => {
    if (map.current && mapReady) {
      const styles = {
        dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        osm: { version: 8, sources: { 'osm-tiles': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OSM' } }, layers: [{ id: 'osm-layer', type: 'raster', source: 'osm-tiles' }] }
      };
      map.current.setStyle(styles[currentBasemap]);
    }
  }, [currentBasemap, mapReady]);

  useEffect(() => {
    if (mapReady && map.current) {
      const source = map.current.getSource('titik-site');
      if (source) source.setData({ type: 'FeatureCollection', features: filteredFeatures });
    }
  }, [filteredFeatures, mapReady, styleLoaded]);

  useEffect(() => {
    if (!mapReady || !map.current || listProvinsi.length === 0) return;

    let filterExp = null;
    if (selKel) {
      filterExp = ['all', ['==', ['get', 'nama_prop'], selProv], ['==', ['get', 'nama_kab'], selKab], ['==', ['get', 'nama_kec'], selKec], ['==', ['get', 'nama_kel'], selKel]];
    } else if (selKec) {
      filterExp = ['all', ['==', ['get', 'nama_prop'], selProv], ['==', ['get', 'nama_kab'], selKab], ['==', ['get', 'nama_kec'], selKec]];
    } else if (selKab) {
      filterExp = ['all', ['==', ['get', 'nama_prop'], selProv], ['==', ['get', 'nama_kab'], selKab]];
    } else if (selProv) {
      filterExp = ['==', ['get', 'nama_prop'], selProv];
    }

    if (map.current.getLayer('batas-desa-fill')) map.current.setFilter('batas-desa-fill', filterExp);
    if (map.current.getLayer('batas-desa-line')) map.current.setFilter('batas-desa-line', filterExp);

    let targetProp = 'nama_prop';
    let colorsList = listProvinsi;

    if (selKec) {
      targetProp = 'nama_kel';
      colorsList = listKelurahan; 
    } else if (selKab) {
      targetProp = 'nama_kec';
      colorsList = listKecamatan; 
    } else if (selProv) {
      targetProp = 'nama_kab';
      colorsList = listKabupaten; 
    }

    if (colorsList.length > 0) {
      const matchExpression = ['match', ['get', targetProp]];
      colorsList.forEach((val, index) => {
        const hue = (index * 137.5) % 360; 
        matchExpression.push(val, `hsl(${hue}, 65%, 35%)`); 
      });
      matchExpression.push('rgba(0,0,0,0)');

      if (map.current.getLayer('batas-desa-fill')) {
        map.current.setPaintProperty('batas-desa-fill', 'fill-color', matchExpression);
      }
    }
  }, [mapReady, styleLoaded, selProv, selKab, selKec, selKel, listProvinsi, listKabupaten, listKecamatan, listKelurahan]);

  const formatStruktur = (val) => {
    if (val === 'KAB-KOTA') return 'KABUPATEN / KOTA';
    if (val === 'KELURAHAN') return 'KELURAHAN / DESA';
    return val;
  };

  const renderField = (level, val) => {
    if (!val || String(val).trim() === '' || String(val).toLowerCase() === 'undefined') return '-';
    if (!clickedSite || !clickedSite.STRUKTUR) return val;
    const struct = clickedSite.STRUKTUR.toUpperCase();
    if (struct === 'PROVINSI') { if (level !== 'prov') return '-'; } 
    else if (struct === 'KAB-KOTA' || struct === 'KABUPATEN') { if (level === 'kec' || level === 'kel') return '-'; } 
    else if (struct === 'KECAMATAN') { if (level === 'kel') return '-'; }
    
    return level === 'struct' ? formatStruktur(val) : val;
  };

  const modalTableData = useMemo(() => {
    if (!selectedModal) return [];
    if (selectedModal === 'total') return filteredFeatures;
    if (selectedModal === 'online') return filteredFeatures.filter(f => f.properties.status_link === 'AKTIF');
    if (selectedModal === 'offline') return filteredFeatures.filter(f => f.properties.status_link === 'TIDAK AKTIF');
    return [];
  }, [selectedModal, filteredFeatures]);

  const strukturDisplay = {
    'PROVINSI': 'PROVINSI',
    'KAB-KOTA': 'KABUPATEN / KOTA',
    'KECAMATAN': 'KECAMATAN',
    'KELURAHAN': 'KELURAHAN / DESA'
  };
  const strukturOrder = ['PROVINSI', 'KAB-KOTA', 'KECAMATAN', 'KELURAHAN'];

  // FUNGSI UNTUK EXPORT DATA KE EXCEL (CSV)
  const handleExportExcel = () => {
    if (!modalTableData || modalTableData.length === 0) return;

    // 1. Siapkan Header Kolom
    const headers = ['Site ID', 'Site Name', 'Provinsi', 'Kabupaten', 'Koneksi', 'Provider', 'Struktur', 'Bandwidth', 'SLA (AV) %', 'Status'];

    // 2. Susun Baris Data
    const csvRows = [headers.join(',')];

    modalTableData.forEach(feature => {
      const p = feature.properties;
      const row = [
        `"${p.kodesite || ''}"`,
        `"${p["NAMA SITE"] || p.text_site || ''}"`,
        `"${p.nama_prop || p.PROVINSI || p.provinsi || ''}"`,
        `"${p.nama_kab || p.KABUPATEN || p.kabupaten || p["KABUPATEN/KOTA"] || ''}"`,
        `"${p.type_koneksi || ''}"`,
        `"${p.Provider || ''}"`,
        `"${p.STRUKTUR || ''}"`,
        `"${p.bandwidth || ''}"`,
        `${(parseSLA(p.AV) * 100).toFixed(2)}`,
        `"${p.status_link || 'UNKNOWN'}"`
      ];
      csvRows.push(row.join(','));
    });

    // 3. Proses Download File
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Export_Data_${selectedModal.toUpperCase()}_Sites.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      <div ref={mapContainer} className="absolute inset-0 z-0" />

      {/* POPUP KETIKA TIDAK ADA DATA DI RANGE YANG DIPILIH */}
      {!hasData && rawData.length > 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900/95 px-10 py-8 rounded-2xl border border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.2)] flex flex-col items-center animate-pulse">
            <span className="text-5xl mb-4">📭</span>
            <h2 className="text-2xl font-bold tracking-widest text-red-400 uppercase drop-shadow-md">Tidak Ada Data</h2>
            <p className="text-slate-300 text-sm mt-2 font-mono">Periode {displayRange} belum tersedia.</p>
          </div>
        </div>
      )}

      {/* HIGHLIGHT UTAMA (AVG. AVAILABILITY) */}
      <div className="absolute top-4 left-4 z-10 pointer-events-auto">
        <div className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-md px-5 py-3 rounded-xl border border-sky-500/50 shadow-[0_0_25px_rgba(14,165,233,0.25)] flex flex-col justify-center border-l-4 border-l-sky-400 relative overflow-hidden group">
          <div className="absolute inset-0 bg-sky-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80 mb-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> 
            AVG. AVAILABILITY
          </span>
          <span className="text-2xl font-mono font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-300 leading-tight">
            {metrics.avgSLA.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* SISI KANAN ATAS: BASEMAP & TREND CHART */}
      <div className="absolute top-4 right-4 z-10 pointer-events-none flex flex-col items-end gap-3">
        <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl flex gap-1 pointer-events-auto">
          <button onClick={() => setCurrentBasemap('dark')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition ${currentBasemap === 'dark' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-transparent text-slate-400 hover:text-white'}`}>Carto Dark</button>
          <button onClick={() => setCurrentBasemap('osm')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition ${currentBasemap === 'osm' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-transparent text-slate-400 hover:text-white'}`}>OSM</button>
        </div>
        
        <TrendChart data={trendData} />
      </div>

      {/* TENGAH ATAS: JARKOMDAT MONITORING SYSTEM & PANEL FILTER */}
      <div className="absolute top-0 left-0 w-full z-20 flex flex-col items-center pointer-events-none">
        <button 
          onClick={() => setIsFilterOpen(!isFilterOpen)} 
          className={`relative z-30 bg-slate-900/95 backdrop-blur-md px-5 py-2.5 border-x border-b border-emerald-500/40 shadow-[0_4px_20px_rgba(16,185,129,0.15)] pointer-events-auto flex items-center gap-4 transition-all hover:bg-slate-800 cursor-pointer group ${isFilterOpen ? 'rounded-b-none' : 'rounded-b-2xl'}`}
        >
          <img src="./kemendagri.svg" alt="Logo Kemendagri" className="h-10 w-10 object-contain flex-shrink-0 drop-shadow-md" />
          <h1 className="text-sm font-bold tracking-widest text-emerald-400 uppercase drop-shadow-md text-center select-none">
            JARKOMDAT MONITORING SYSTEM
          </h1>
          <div className="bg-slate-800/80 w-6 h-6 flex items-center justify-center rounded text-xs text-slate-400 group-hover:text-emerald-400 transition font-mono flex-shrink-0">
            {isFilterOpen ? '✕' : '▼'}
          </div>
        </button>

        <div className={`relative z-20 pointer-events-auto transition-all duration-300 ease-out transform origin-top overflow-visible ${isFilterOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full absolute pointer-events-none'}`}>
          <div className="bg-slate-900/95 backdrop-blur-md p-3 px-6 rounded-b-xl border-x border-b border-emerald-500/40 shadow-2xl flex flex-wrap justify-center items-center gap-3 text-xs -mt-[1px]">
            <input type="text" placeholder="Search ID/Name..." className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 w-44 text-slate-200 focus:outline-none focus:border-emerald-500 transition shadow-inner text-xs font-semibold" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            
            <CustomSelect 
              value={selectedType} 
              onChange={setSelectedType} 
              options={uniqueTypes} 
              placeholder="Tipe Koneksi (All)"
              className="w-40"
            />
            
            <div className="relative">
              <button 
                type="button"
                onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-300 shadow-inner flex justify-between items-center w-48 text-left cursor-pointer hover:border-slate-600 transition text-xs font-semibold"
              >
                <span className="truncate pr-2">
                  {selectedProviders.length === 0 ? 'Provider (All)' : `Provider (${selectedProviders.length} Terpilih)`}
                </span>
                <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">{isProviderDropdownOpen ? '▲' : '▼'}</span>
              </button>

              {isProviderDropdownOpen && (
                <div className="absolute left-0 mt-1 w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] p-2 z-50 max-h-60 overflow-y-auto border-t-2 border-t-emerald-500 custom-scrollbar">
                  {uniqueProviders.map(p => {
                    const isChecked = selectedProviders.includes(p);
                    return (
                      <label key={p} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-850 rounded cursor-pointer select-none text-slate-300 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedProviders(selectedProviders.filter(item => item !== p));
                            } else {
                              setSelectedProviders([...selectedProviders, p]);
                            }
                          }}
                          className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 cursor-pointer"
                        />
                        <span className="text-xs font-semibold truncate" title={p}>{p}</span>
                      </label>
                    );
                  })}
                  {selectedProviders.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setSelectedProviders([])}
                      className="w-full text-center text-[10px] text-red-400 hover:text-red-300 font-bold border-t border-slate-800 pt-2 mt-1.5 cursor-pointer"
                    >
                      ✕ Bersihkan Pilihan
                    </button>
                  )}
                </div>
              )}
            </div>

            <CustomSelect 
              value={selectedStructure} 
              onChange={setSelectedStructure} 
              options={[
                 ...strukturOrder.filter(s => uniqueStructures.includes(s)).map(s => ({ value: s, label: strukturDisplay[s] })),
                 ...uniqueStructures.filter(s => !strukturOrder.includes(s) && s !== 'N/A' && s !== '').map(s => ({ value: s, label: s }))
              ]} 
              placeholder="Struktur (All)"
              className="w-48"
            />
          </div>
        </div>
      </div>

      {/* LACI INFORMASI DETAIL */}
      <div className={`absolute top-1/2 -translate-y-1/2 left-0 z-30 flex items-center transition-transform duration-300 ease-in-out ${isDetailOpen ? 'translate-x-0' : '-translate-x-[22rem]'}`}>
        <div className="w-[22rem] bg-slate-900/95 backdrop-blur-md p-5 rounded-br-2xl border-y border-r border-emerald-500/40 shadow-[20px_0_30px_rgba(0,0,0,0.5)] h-[62vh] overflow-y-auto pointer-events-auto flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
            <span className="text-base">📋</span> Panel Informasi Detail
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-1">
            {clickedSite ? (
              <div className="space-y-3 text-xs">
                <div><label className="text-[10px] uppercase text-slate-500 block font-semibold">Site Name</label><p className="text-sm font-bold text-emerald-400 leading-tight">{clickedSite["NAMA SITE"] || clickedSite.text_site || '-'}</p></div>
                <div><label className="text-[10px] uppercase text-slate-500 block">Site ID</label><p className="font-mono font-medium text-slate-200">{clickedSite.kodesite || '-'}</p></div>
                <div className="grid grid-cols-2 gap-3 border-y border-slate-800/60 py-3 my-3 bg-slate-950/40 p-2 rounded">
                  <div><label className="text-[10px] uppercase text-slate-500 block">Current Site SLA</label><p className={`font-mono font-bold text-base ${(parseSLA(clickedSite.AV) * 100) >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>{(parseSLA(clickedSite.AV) * 100).toFixed(2)}%</p></div>
                  <div><label className="text-[10px] uppercase text-slate-500 block">Struktur</label><p className="font-semibold text-slate-300">{renderField('struct', clickedSite.STRUKTUR)}</p></div>
                </div>
                <div className="space-y-2">
                  <div><label className="text-[10px] uppercase text-slate-500 block">Provinsi</label><p className="text-slate-300 font-medium">{renderField('prov', clickedSite.nama_prop || clickedSite.PROVINSI || clickedSite.provinsi)}</p></div>
                  <div><label className="text-[10px] uppercase text-slate-500 block">Kabupaten / Kota</label><p className="text-slate-300 font-medium">{renderField('kab', clickedSite.nama_kab || clickedSite.KABUPATEN || clickedSite.kabupaten || clickedSite["KABUPATEN/KOTA"])}</p></div>
                  <div><label className="text-[10px] uppercase text-slate-500 block">Kecamatan</label><p className="text-slate-300 font-medium">{renderField('kec', clickedSite.nama_kec || clickedSite.KECAMATAN || clickedSite.kecamatan)}</p></div>
                  <div><label className="text-[10px] uppercase text-slate-500 block">Kelurahan / Desa</label><p className="text-slate-300 font-medium">{renderField('kel', clickedSite.nama_kel || clickedSite.KELURAHAN || clickedSite.kelurahan || clickedSite.DESA)}</p></div>
                  <div className="pt-2 border-t border-slate-850 grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] uppercase text-slate-500 block">Tipe Koneksi</label><p className="text-slate-300 font-medium">{renderField('type', clickedSite.type_koneksi)}</p></div>
                    <div><label className="text-[10px] uppercase text-slate-500 block">Bandwidth</label><p className="text-slate-300 font-medium">{renderField('bw', clickedSite.bandwidth)}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] uppercase text-slate-500 block">Provider</label><p className="text-slate-300 font-medium">{renderField('prov', clickedSite.Provider)}</p></div>
                    <div><label className="text-[10px] uppercase text-slate-500 block">Link Kategori</label><p className="text-slate-300 font-medium">{clickedSite.dual_link ? 'Dual Link' : 'Single Link'}</p></div>
                  </div>
                </div>
              </div>
            ) : 
            clickedRegion ? (
              <div className="space-y-4 text-xs">
                <div className="bg-sky-500/10 border border-sky-500/20 p-3 rounded-lg mb-2"><p className="text-sky-400 italic">Data Wilayah Administrasi</p></div>
                <div><label className="text-[10px] uppercase text-slate-500 block">Provinsi</label><p className="text-base font-bold text-slate-200">{clickedRegion.nama_prop || '-'}</p></div>
                <div><label className="text-[10px] uppercase text-slate-500 block">Kabupaten / Kota</label><p className="text-sm font-semibold text-slate-300">{clickedRegion.nama_kab || '-'}</p></div>
                <div><label className="text-[10px] uppercase text-slate-500 block">Kecamatan</label><p className="text-sm font-semibold text-slate-300">{clickedRegion.nama_kec || '-'}</p></div>
                <div><label className="text-[10px] uppercase text-slate-500 block">Kelurahan / Desa</label><p className="text-sm font-semibold text-slate-300">{clickedRegion.nama_kel || '-'}</p></div>
              </div>
            ) : 
            (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-lg text-slate-500"><span className="text-2xl mb-2">👆</span><p className="text-[11px]">Klik salah satu titik site atau wilayah pada peta.</p></div>
            )}
          </div>
        </div>

        <button onClick={() => setIsDetailOpen(!isDetailOpen)} className="bg-slate-900/95 border-y border-r border-emerald-500/40 py-5 px-1.5 rounded-r-xl pointer-events-auto hover:bg-slate-800 transition shadow-[5px_0_15px_rgba(16,185,129,0.15)] flex flex-col items-center justify-center gap-3 cursor-pointer group">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mb-1" />
          <span className="text-slate-300 group-hover:text-emerald-400 font-bold tracking-[0.2em] uppercase text-[10px] transition-colors" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Informasi Detail</span>
          <span className="text-slate-500 text-[10px] font-mono mt-1">{isDetailOpen ? '◀' : '▶'}</span>
        </button>
      </div>

      {/* LACI FILTER HIERARKI MENGGUNAKAN CUSTOM SELECT */}
      <div className={`absolute top-1/2 -translate-y-1/2 right-0 z-30 flex flex-row-reverse items-center transition-transform duration-300 ease-in-out ${isHierarchyOpen ? 'translate-x-0' : 'translate-x-[20rem]'}`}>
        <div className="w-[20rem] bg-slate-900/95 backdrop-blur-md p-5 rounded-bl-2xl border-y border-l border-emerald-500/40 shadow-[-20px_0_30px_rgba(0,0,0,0.5)] h-fit max-h-[55vh] pointer-events-auto flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2"><span className="text-base">🎛️</span> Filter Hierarki Spasial</h2>
          
          <div className="space-y-3 flex-1 overflow-visible pr-1 pb-1">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 uppercase font-medium block">Provinsi</label>
              <CustomSelect value={selProv} onChange={(val) => handleHierarchyChange('prov', val)} options={listProvinsi} placeholder="-- Select Provinsi --" />
            </div>
            <div className="space-y-1.5 mt-2">
              <label className="text-[10px] text-slate-500 uppercase font-medium block">Kabupaten / Kota</label>
              <CustomSelect value={selKab} onChange={(val) => handleHierarchyChange('kab', val)} options={listKabupaten} placeholder="-- Select Kabupaten --" disabled={!selProv} />
            </div>
            <div className="space-y-1.5 mt-2">
              <label className="text-[10px] text-slate-500 uppercase font-medium block">Kecamatan</label>
              <CustomSelect value={selKec} onChange={(val) => handleHierarchyChange('kec', val)} options={listKecamatan} placeholder="-- Select Kecamatan --" disabled={!selKab} />
            </div>
            <div className="space-y-1.5 mt-2 mb-2">
              <label className="text-[10px] text-slate-500 uppercase font-medium block">Kelurahan / Desa</label>
              <CustomSelect value={selKel} onChange={(val) => handleHierarchyChange('kel', val)} options={listKelurahan} placeholder="-- Select Kelurahan --" disabled={!selKec} />
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-800 pb-1">
              <p className="text-[10px] text-slate-500 italic text-center leading-relaxed">Pilih opsi di atas untuk auto-zoom ke poligon wilayah.</p>
            </div>
          </div>
        </div>

        <button onClick={() => setIsHierarchyOpen(!isHierarchyOpen)} className="bg-slate-900/95 border-y border-l border-emerald-500/40 py-5 px-1.5 rounded-l-xl pointer-events-auto hover:bg-slate-800 transition shadow-[-5px_0_15px_rgba(16,185,129,0.15)] flex flex-col items-center justify-center gap-3 cursor-pointer group">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mb-1" />
          <span className="text-slate-300 group-hover:text-emerald-400 font-bold tracking-[0.2em] uppercase text-[10px] transition-colors" style={{ writingMode: 'vertical-rl' }}>Filter Hierarki</span>
          <span className="text-slate-500 text-[10px] font-mono mt-1">{isHierarchyOpen ? '▶' : '◀'}</span>
        </button>
      </div>

      {/* ==========================================================
          5 KARTU BAWAH (LAYOUT 50:50 LEBAR PROPORSIONAL)
          ========================================================== */}
      {/* PERUBAHAN 1: bottom-4 diganti menjadi bottom-8 agar naik ke atas */}
      <div className="absolute bottom-8 left-4 right-4 z-10 pointer-events-none">
        
        {/* PERUBAHAN 2: lg:h-[120px] diganti lg:h-[140px] dan tambah items-stretch */}
        <div className="flex flex-col lg:flex-row gap-4 pointer-events-auto h-auto lg:h-[140px] w-full items-stretch">
          
          {/* SISI KIRI: 50% Layar (Dibagi 3 Kartu Kecil) */}
          <div className="flex-1 w-full lg:w-1/2 grid grid-cols-3 gap-3 h-full">
            {/* PERUBAHAN 3: Tambah h-full di akhir class kartu */}
            <div onClick={() => setSelectedModal('total')} className="bg-slate-900/80 backdrop-blur-md p-3 xl:p-4 rounded-xl border border-slate-800 shadow-xl cursor-pointer hover:border-blue-500/50 hover:bg-slate-900 transition flex flex-col justify-between group h-full">
              <div className="text-[9px] xl:text-[10px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-blue-400 transition leading-tight">1. Total Site</div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl xl:text-3xl font-bold font-mono text-white">{metrics.total}</span>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-300 hidden xl:block">Tabel Lengkap ↗</span>
              </div>
            </div>

            <div onClick={() => setSelectedModal('online')} className="bg-slate-900/80 backdrop-blur-md p-3 xl:p-4 rounded-xl border border-slate-800 shadow-xl cursor-pointer hover:border-emerald-500/50 hover:bg-slate-900 transition flex flex-col justify-between group h-full">
              <div className="text-[9px] xl:text-[10px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-emerald-400 transition leading-tight">2. Online Site</div>
              <div className="flex items-baseline justify-between mt-1">
                <div className="flex items-baseline gap-1 xl:gap-2">
                  <span className="text-xl xl:text-3xl font-bold font-mono text-emerald-400">{metrics.online}</span>
                  <span className="text-[10px] xl:text-xs font-mono text-emerald-500/70">({metrics.onlinePct}%)</span>
                </div>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-300 hidden xl:block">Tabel Lengkap ↗</span>
              </div>
            </div>

            <div onClick={() => setSelectedModal('offline')} className="bg-slate-900/80 backdrop-blur-md p-3 xl:p-4 rounded-xl border border-slate-800 shadow-xl cursor-pointer hover:border-red-500/50 hover:bg-slate-900 transition flex flex-col justify-between group h-full">
              <div className="text-[9px] xl:text-[10px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-red-400 transition leading-tight">3. Offline Site</div>
              <div className="flex items-baseline justify-between mt-1">
                <div className="flex items-baseline gap-1 xl:gap-2">
                  <span className="text-xl xl:text-3xl font-bold font-mono text-red-400">{metrics.offline}</span>
                  <span className="text-[10px] xl:text-xs font-mono text-red-500/70">({metrics.offlinePct}%)</span>
                </div>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-300 hidden xl:block">Tabel Lengkap ↗</span>
              </div>
            </div>
          </div>

          {/* SISI KANAN: 50% Layar (Dibagi 2 Kartu Lebih Besar) */}
          <div className="flex-1 w-full lg:w-1/2 grid grid-cols-2 gap-3 h-full">
            <div className="bg-slate-900/80 backdrop-blur-md p-2 px-3 rounded-xl border border-slate-800 shadow-xl flex flex-col justify-between group relative overflow-visible z-10 h-full">
              <div className="text-[9px] xl:text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-tight">4. Data Summary</div>
              <div className="flex justify-between items-start gap-1 flex-1 mt-1">
                 <DonutStat title="Tipe Koneksi" data={summaryData.tipe} />
                 <DonutStat title="Provider" data={summaryData.provider} />
                 <DonutStat title="Struktur" data={summaryData.struktur} />
                 <DonutStat title="Bandwidth" data={summaryData.bandwidth} />
              </div>
            </div>

            {/* SINGLE SLIDER CARD */}
            <div className="bg-slate-900/80 backdrop-blur-md p-3 xl:p-4 rounded-xl border border-slate-800 shadow-xl flex flex-col justify-between relative group z-0 h-full">
              <div className="flex justify-between items-start">
                <div className="text-[9px] xl:text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-tight mt-0.5">5. Filter Waktu</div>
                <CustomSelect 
                  value={selectedYear} 
                  onChange={setSelectedYear} 
                  options={uniqueYears} 
                  placeholder="Year"
                  className="w-24"
                  menuUp={true}
                />
              </div>
              
              <div className="flex flex-col mt-auto pb-1">
                {/* Custom Single Range Slider */}
                <div className="relative h-1.5 bg-slate-800 rounded-lg mt-1 w-full flex items-center">
                  {/* Track Aktif (Bar warna hijau dari ujung kiri ke titik bulat) */}
                  <div 
                    className="absolute h-full bg-emerald-500 rounded-lg pointer-events-none transition-all duration-100"
                    style={{ width: `${((selectedMonth - 1) / 11) * 100}%` }}
                  />
                  
                  {/* Slider Input Utama */}
                  <input 
                    type="range" min="1" max="12" value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                    disabled={uniqueYears.length === 0}
                    className="absolute w-full h-full appearance-none bg-transparent cursor-pointer z-20 
                    [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(16,185,129,0.8)] hover:[&::-webkit-slider-thumb]:scale-125 hover:[&::-webkit-slider-thumb]:transition-transform"
                  />
                </div>
                
                {/* Legenda Angka Bulan */}
                <div className="flex justify-between text-[9px] text-slate-500 mt-3 font-mono px-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <span 
                      key={m} 
                      className={m === selectedMonth ? 'text-emerald-400 font-bold scale-125 transition-transform' : 'transition-transform'}
                    >
                      {String(m).padStart(2, '0')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>

      {/* MODAL POPUP (RAW DATA TABLE) */}
      {selectedModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-slate-900 w-full max-w-6xl h-[80vh] rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Raw Data Table — {selectedModal.toUpperCase()} SITES</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Records Found: {modalTableData.length} lines</p>
              </div>
              
              {/* Pembungkus Tombol Export & Close */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleExportExcel} 
                  className="bg-emerald-600/20 border border-emerald-500/50 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 font-semibold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2"
                >
                  <span>⬇</span> Export Excel
                </button>
                <button 
                  onClick={() => setSelectedModal(null)} 
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs transition font-semibold"
                >
                  ✕ Close Table
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800 sticky top-0 z-10">
                    <th className="p-3">Site ID</th>
                    <th className="p-3">Site Name</th>
                    <th className="p-3">Provinsi</th>
                    <th className="p-3">Kabupaten</th>
                    <th className="p-3">Koneksi</th>
                    <th className="p-3">Provider</th>
                    {/* DUA HEADER BARU DI BAWAH INI */}
                    <th className="p-3">Struktur</th>
                    <th className="p-3">Bandwidth</th>
                    <th className="p-3">SLA (AV)</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {modalTableData.length > 0 ? modalTableData.map((feature, idx) => {
                    const p = feature.properties;
                    return (
                      <tr key={idx} className="hover:bg-slate-850/50 transition font-sans">
                        <td className="p-3 font-mono font-medium text-sky-400">{p.kodesite || '-'}</td>
                        <td className="p-3 font-semibold text-slate-200">{p["NAMA SITE"] || p.text_site || '-'}</td>
                        <td className="p-3 text-slate-300">{p.nama_prop || p.PROVINSI || p.provinsi || '-'}</td>
                        <td className="p-3 text-slate-300">{p.nama_kab || p.KABUPATEN || p.kabupaten || p["KABUPATEN/KOTA"] || '-'}</td>
                        <td className="p-3 text-slate-400">{p.type_koneksi || '-'}</td>
                        <td className="p-3 text-slate-300">{p.Provider || '-'}</td>
                        {/* DUA DATA BARU DI BAWAH INI */}
                        <td className="p-3 text-slate-300">{p.STRUKTUR || '-'}</td>
                        <td className="p-3 text-slate-300">{p.bandwidth || '-'}</td>
                        <td className="p-3 font-mono text-amber-400">{(parseSLA(p.AV) * 100).toFixed(2)}%</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status_link === 'AKTIF' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                            {p.status_link || 'UNKNOWN'}
                          </span>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      {/* colSpan diubah dari 8 menjadi 10 agar tabel tidak bolong */}
                      <td colSpan="10" className="p-8 text-center text-slate-500 italic">No matching records available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
