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

// 3. Fungsi Pewarnaan Provider Berdasarkan Brand
const getProviderColor = (providerName) => {
  const name = String(providerName).toUpperCase();
  if (name.includes('TELKOM')) return { text: 'text-red-500', bg: 'bg-red-500' };
  if (name.includes('ICON')) return { text: 'text-teal-400', bg: 'bg-teal-400' };
  if (name.includes('XL')) return { text: 'text-amber-500', bg: 'bg-amber-500' };
  return { text: 'text-sky-400', bg: 'bg-sky-400' }; // Default warna biru
};

// 4. Fungsi Klasifikasi Warna Nilai Ketersediaan (AV) (Disinkronkan dengan Peta)
const getAVColorClass = (val) => {
  if (val === null || val === undefined || val === '' || val === '-') return 'text-slate-300';
  
  const num = parseSLA(val) * 100;
  
  // Hijau (90% - 100%)
  if (num >= 90) return 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.6)]'; 
  
  // Kuning (50% - 89.9%)
  if (num >= 50) return 'text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.6)]';   
  
  // Merah (1% - 49.9%)
  if (num > 0) return 'text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.6)]';         
  
  // Hitam (0%) dengan "Halo" Putih Bercahaya agar sangat terlihat
  return 'text-black-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.6)'; 
};

// 5. FUNGSI NORMALISASI TIPE KONEKSI (Lebih Kuat)
const normalizeTipeKoneksi = (val) => {
  if (!val || String(val).trim() === '') return '-';
  const upperVal = String(val).toUpperCase().trim();
  
  // Jika teks mengandung kata VSAT dan WIRELINE sekaligus (apapun urutannya)
  if (upperVal.includes('VSAT') && upperVal.includes('WIRELINE')) {
    return 'WIRELINE & VSAT';
  }
  
  // Kembalikan dalam huruf kapital agar pasti seragam saat dijumlahkan
  return upperVal; 
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
        <span className="text-[11px] text-slate-500 font-mono flex-shrink-0">{isOpen ? (menuUp ? '▼' : '▲') : (menuUp ? '▲' : '▼')}</span>
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
// 4. TREND BULANAN CHART
// ==========================================================
const TrendChart = ({ data, displayRange, isGold, isDarkMode }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!data || data.length === 0) return null;
  const width = 800; const height = 40; const paddingX = 80; const paddingTop = -10; const paddingBottom = 10; 
  const getX = (i) => paddingX + (i / (data.length - 1)) * (width - 2 * paddingX);
  const getY = (val) => height - paddingBottom - ((Math.max(80, Math.min(val, 100)) - 80) / 20) * (height - paddingTop - paddingBottom);
  const points = data.map((d, i) => `${getX(i)},${getY(d.avg)}`).join(' ');

  return (
    <div className={`backdrop-blur-md p-4 xl:p-5 rounded-2xl flex flex-col relative group overflow-hidden w-full h-full ${isDarkMode ? 'bg-slate-900/60 border border-slate-700/50 shadow-lg' : 'bg-white/90 border border-slate-200 shadow-xl'}`}>
       <div className={`text-[11px] xl:text-[13px] uppercase font-bold tracking-wider mb-1 flex justify-between items-center z-10 flex-shrink-0 ${isGold ? (isDarkMode ? 'text-amber-400' : 'text-amber-500') : (isDarkMode ? 'text-slate-400' : 'text-slate-500')}`}>
         <span>📈 TREND BULANAN AVAILABILITY</span>
         <div className="flex items-center gap-3 xl:gap-4">
            <div className={`flex items-center gap-1.5 border-r pr-3 xl:pr-4 ${isDarkMode ? 'border-slate-700/80' : 'border-slate-300'}`}>
               <span className={`text-[9px] xl:text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>AVG:</span>
               <span className="text-sm xl:text-base text-emerald-400 font-mono font-bold drop-shadow-md">{data[data.length-1].avg.toFixed(2)}%</span>
            </div>
            <div className={`rounded-md px-2 py-1 flex items-center gap-1.5 shadow-inner border ${isDarkMode ? 'bg-slate-800/80 border-slate-600/50' : 'bg-slate-100 border-slate-300'}`}>
               <span className={`text-[9px] xl:text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>PERIODE:</span>
               <span className={`text-[10px] xl:text-[11px] font-mono font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{displayRange}</span>
            </div>
         </div>
       </div>
       <div className="relative flex-1 w-full mt-2 min-h-0">
         <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full overflow-visible">
            <line x1={paddingX} y1={paddingTop} x2={paddingX} y2={height - paddingBottom} stroke={isDarkMode ? '#334155' : '#cbd5e1'} strokeWidth="2" strokeLinecap="round" />
            <text x={paddingX - 40} y={(paddingTop + (height - paddingBottom)) / 2} fontSize="10" fontWeight="bold" fill={isDarkMode ? '#94a3b8' : '#64748b'} textAnchor="middle" transform={`rotate(-90, ${paddingX - 40}, ${(paddingTop + (height - paddingBottom)) / 2})`} className="tracking-widest">AV.(%)</text>
            {[100, 90, 80].map(val => (
              <g key={val}>
                <text x={paddingX - 10} y={getY(val)} fontSize="10" fill={isDarkMode ? '#64748b' : '#94a3b8'} textAnchor="end" dominantBaseline="middle" className="font-mono">{val}%</text>
                <line x1={paddingX} y1={getY(val)} x2={width - paddingX + 20} y2={getY(val)} stroke={isDarkMode ? '#334155' : '#cbd5e1'} strokeWidth={val === 80 ? "2" : "1"} strokeDasharray={val === 80 ? "" : "4 4"} opacity={val === 80 ? "1" : "0.5"} />
              </g>
            ))}
            <text x={width / 2} y={height - -20} fontSize="10" fontWeight="bold" fill={isDarkMode ? '#94a3b8' : '#64748b'} textAnchor="middle" className="tracking-widest">PERIODE BULAN</text>
            <polyline points={points} fill="none" stroke="#10b981" strokeWidth="3" strokeLinejoin="round" className="opacity-80 group-hover:opacity-100 transition-opacity drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            {data.map((d, i) => (
               <g key={i} className="cursor-crosshair" onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                 {hoverIdx === i && <line x1={getX(i)} y1={getY(d.avg)} x2={getX(i)} y2={getY(80)} stroke="#34d399" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />}
                 <circle cx={getX(i)} cy={getY(d.avg)} r={hoverIdx === i ? "6" : "4"} fill={hoverIdx === i ? "#34d399" : (isDarkMode ? "#0f172a" : "#ffffff")} stroke="#10b981" strokeWidth={hoverIdx === i ? "2.5" : "1.5"} className="transition-all duration-200" />
                 <circle cx={getX(i)} cy={getY(d.avg)} r="20" fill="transparent" />
                 <text x={getX(i)} y={getY(80) + 16} fontSize="10" fontWeight="bold" fill={hoverIdx === i ? "#34d399" : (isDarkMode ? "#64748b" : "#94a3b8")} textAnchor="middle" className="font-mono transition-colors duration-200 pointer-events-none">{d.month.split('/')[1]}</text>
               </g>
            ))}
         </svg>
         {hoverIdx !== null && (
           <div className={`absolute backdrop-blur-md border border-emerald-500/50 p-2.5 rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 text-[10px] xl:text-xs pointer-events-none transform -translate-y-full transition-all duration-100 ${isDarkMode ? 'bg-slate-900/95' : 'bg-white/95'}`} style={{ left: `calc(${(hoverIdx / (data.length - 1)) * 100}%)`, top: `calc(${((getY(data[hoverIdx].avg)) / height) * 100}% - 15px)`, transform: `translate(${hoverIdx === data.length - 1 ? '-95%' : hoverIdx === 0 ? '-5%' : '-50%'}, -100%)`}}>
             <h3 className={`font-bold uppercase tracking-wider border-b pb-1 mb-1.5 text-center ${isDarkMode ? 'text-slate-300 border-slate-700' : 'text-slate-700 border-slate-200'}`}>{data[hoverIdx].month}</h3>
             <div className="flex justify-between items-center gap-4">
               <span className="font-semibold drop-shadow-md text-emerald-400">AVG</span>
               <span className={`font-mono font-bold text-sm ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{data[hoverIdx].avg.toFixed(2)}%</span>
             </div>
           </div>
         )}
       </div>
    </div>
  );
};

// ==========================================================
// 5. KONTROL PERIODE SLIDER
// ==========================================================
const DashTimeSlider = ({ selectedYear, setSelectedYear, selectedMonth, setSelectedMonth, uniqueYears, isGold, isDarkMode }) => {
  return (
    <div className={`backdrop-blur-md p-4 xl:p-5 rounded-2xl w-full h-full flex flex-col justify-between relative group overflow-hidden ${isDarkMode ? 'bg-slate-900/60 border border-slate-700/50 shadow-lg' : 'bg-white/90 border border-slate-200 shadow-xl'}`}>
       <div className="flex justify-between items-center mb-2 z-10 flex-shrink-0">
         <h3 className={`text-[11px] xl:text-[13px] uppercase font-bold tracking-wider flex items-center gap-2 ${isGold ? (isDarkMode ? 'text-amber-400' : 'text-amber-500') : (isDarkMode ? 'text-slate-400' : 'text-slate-500')}`}><span>⏱️ FILTER WAKTU</span></h3>
         <div className="w-24"><CustomSelect value={selectedYear} onChange={setSelectedYear} options={uniqueYears} placeholder="Tahun" disabled={uniqueYears.length === 0} menuUp={false} /></div>
       </div>
       <div className="flex-1 flex flex-col justify-center mt-2 pb-1 relative z-0">
          <div className="flex flex-col w-full">
            <div className={`relative h-2 rounded-lg w-full flex items-center shadow-inner ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div className="absolute h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-lg pointer-events-none transition-all duration-300 ease-out" style={{ width: `${((selectedMonth - 1) / 11) * 100}%` }} />
              <input type="range" min="1" max="12" value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))} disabled={uniqueYears.length === 0} className="absolute w-full h-full appearance-none bg-transparent cursor-pointer z-20 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            </div>
            <div className="flex justify-between text-[9px] xl:text-[11px] text-slate-500 mt-3 font-mono px-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <span key={m} className={m === selectedMonth ? 'text-emerald-400 font-extrabold scale-125 transition-transform drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]' : `transition-transform font-semibold ${isDarkMode ? 'hover:text-slate-300' : 'hover:text-slate-700'}`}>{String(m).padStart(2, '0')}</span>
              ))}
            </div>
          </div>
       </div>
    </div>
  );
};

// ==========================================================
// KOMPONEN: MINI DONUT CHART (DIKECILKAN PROPORSIONAL)
// ==========================================================
const DonutStat = ({ title, data, onPieClick, isActive }) => {
  const colors = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#a855f7'];
  let cumulative = 0;
  const gradient = data.map((d, i) => {
    const start = cumulative;
    cumulative += parseFloat(d.pct);
    return `${colors[i % colors.length]} ${start}% ${cumulative}%`;
  }).join(', ');

  return (
    <div className={`flex flex-col items-center flex-1 mt-[-4px] cursor-pointer transition-all duration-300 ${!isActive ? 'blur-[2px] opacity-30 scale-95' : 'blur-0 opacity-100 scale-100'}`} onClick={() => onPieClick({ title, data })}>
      
      {/* JUDUL */}
      <h4 className="text-[9px] xl:text-[10px] uppercase tracking-wider text-slate-300 font-bold text-center h-auto leading-tight flex items-center justify-center mb-1.5">
        {title}
      </h4>
      
      {/* GRAFIK DONUT LEBIH KECIL */}
      <div 
        className="relative w-14 h-14 xl:w-16 xl:h-16 mb-2 flex items-center justify-center rounded-full transition-transform hover:scale-105 shadow-[0_0_15px_rgba(0,0,0,0.6)] flex-shrink-0" 
        style={{ background: `conic-gradient(${gradient || '#1e293b 0% 100%'})` }}
      >
         <div className="w-5 h-5 xl:w-6 xl:h-6 bg-slate-900 rounded-full shadow-inner" />
      </div>
      
      {/* LEGENDA LEBIH KECIL */}
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 w-full px-1">
        {data.length > 0 ? data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1 leading-none" title={`${d.name}: ${d.pct}% (${d.count} Site)`}>
            <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="truncate text-slate-200 font-bold max-w-[50px] xl:max-w-[60px] text-[7px] xl:text-[8px]">{d.name}</span>
          </div>
        )) : (
          <span className="text-[9px] text-red-400/80 font-bold italic tracking-wider mt-1">NO DATA</span>
        )}
      </div>

    </div>
  );
};

// ==========================================================
// KOMPONEN BARU: GAUGE ZOOM LEVEL METER (KUNCIAN HIERARKI)
// ==========================================================
const ZoomGauge = ({ zoom, selProv, selKab, selKec, selKel }) => {
  const levels = [
    { name: 'NASIONAL' },
    { name: 'PROVINSI' },
    { name: 'KABUPATEN' },
    { name: 'KECAMATAN' },
    { name: 'DESA / KEL' }
  ];

  let activeIndex = 0;

  // PRIORITAS 1: Jika Filter Hierarki Digunakan (Mengunci posisi indikator)
  // Walaupun Yogyakarta area petanya kecil dan butuh zoom dalam, 
  // indikator akan tetap dipaksa menunjuk ke "PROVINSI".
  if (selKel) {
    activeIndex = 4;
  } else if (selKec) {
    activeIndex = 3;
  } else if (selKab) {
    activeIndex = 2;
  } else if (selProv) {
    activeIndex = 1;
  } 
  // PRIORITAS 2: Jika Filter Kosong (Kembali mendeteksi scroll mouse)
  else {
    if (zoom >= 12) activeIndex = 4;
    else if (zoom >= 10) activeIndex = 3;
    else if (zoom >= 8) activeIndex = 2;
    else if (zoom >= 6) activeIndex = 1;
    else activeIndex = 0;
  }

  const currentLevel = levels[activeIndex].name;
  
  // Rumus persentase pengisian garis presisi 4 lompatan
  const percentage = (activeIndex / (levels.length - 1)) * 100;

  return (
    <div className="bg-slate-900/95 backdrop-blur-xl py-1.5 px-3 rounded-lg border border-slate-700/80 shadow-[0_5px_15px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center w-[100px] xl:w-[120px] relative pointer-events-none">
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-4 bg-emerald-500/10 blur-[8px] rounded-full pointer-events-none" />

      <div className="flex flex-col items-center mb-1.5 w-full relative z-10">
        <span className="text-[7px] xl:text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 font-mono mb-0.5">
          Level Zoom
        </span>
        <span className="text-[9px] xl:text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)] transition-all duration-300">
          {currentLevel}
        </span>
      </div>

      <div className="w-full relative z-10 flex items-center h-2">
        <div className="absolute left-0 w-full h-[2px] bg-slate-800 rounded-full shadow-inner overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-sky-500 via-emerald-400 to-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="absolute left-0 w-full flex justify-between items-center px-[0px]">
          {levels.map((_, i) => (
            <div 
              key={i} 
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 z-20 ${i <= activeIndex ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,1)]' : 'bg-slate-700'}`} 
            />
          ))}
        </div>
      </div>

    </div>
  );
};

// ==========================================================
// 1. KARTU DASHBOARD EKSKUTIF (Mendukung Mode Small, Normal & Large)
// ==========================================================
const DashCard = ({ title, value, sub, icon, images, color, small, large, isGold, onClick, isDarkMode }) => (
  <div 
    onClick={onClick}
    className={`w-full h-full backdrop-blur-md rounded-2xl p-4 xl:p-5 flex flex-col justify-between overflow-hidden group transition-all duration-300 ${
      isDarkMode 
        ? 'bg-slate-900/60 border border-slate-700/50 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-slate-800/80' 
        : 'bg-white/90 border border-slate-200 shadow-xl hover:bg-white'
    } ${onClick ? (isDarkMode ? 'cursor-pointer hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'cursor-pointer hover:border-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]') : ''}`}
  >
    <div className="flex justify-between items-start mb-1">
      {/* UKURAN JUDUL DIPERBESAR JIKA LARGE */}
      <h3 className={`${small ? 'text-xs xl:text-sm' : large ? 'text-base xl:text-xl' : 'text-sm xl:text-base'} font-bold uppercase tracking-wider ${isGold ? (isDarkMode ? 'text-amber-400' : 'text-amber-500') : (isDarkMode ? 'text-slate-400' : 'text-slate-500')} truncate pr-1 drop-shadow-sm`}>
        {title}
      </h3>
      <div className="flex gap-1.5 xl:gap-2 items-center flex-shrink-0">
        {images ? (
          // UKURAN GAMBAR LOGO DIPERBESAR JIKA LARGE
          images.map((img, idx) => <img key={idx} src={img} className={`${small ? 'h-6 xl:h-7' : large ? 'h-12 xl:h-16' : 'h-8 xl:h-10'} w-auto object-contain drop-shadow-md transition-transform duration-300 ${onClick ? 'group-hover:scale-110' : ''}`} />)
        ) : (
          // UKURAN ICON DIPERBESAR JIKA LARGE
          <span className={`${small ? 'text-2xl xl:text-3xl' : large ? 'text-5xl xl:text-6xl' : 'text-3xl xl:text-4xl'} opacity-80 drop-shadow-md transition-transform duration-300 ${onClick ? 'group-hover:scale-110' : ''}`}>{icon}</span>
        )}
      </div>
    </div>
    <div className="flex flex-col mt-auto">
      <div className="flex items-baseline gap-1.5 xl:gap-2">
        {/* UKURAN ANGKA UTAMA DIPERBESAR JIKA LARGE */}
        <span className={`${small ? 'text-3xl xl:text-4xl' : large ? 'text-7xl xl:text-[5.5rem]' : 'text-5xl xl:text-6xl'} font-mono font-extrabold ${color} drop-shadow-lg truncate transition-transform duration-300 ${onClick ? 'group-hover:translate-x-1' : ''}`}>{value}</span>
        {sub && <span className={`${small ? 'text-xs xl:text-sm' : large ? 'text-xl xl:text-2xl' : 'text-base xl:text-xl'} font-mono font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</span>}
      </div>
      {onClick && (
        <span className={`text-[9px] xl:text-[10px] font-medium mt-1.5 transition-colors flex items-center gap-1 ${isDarkMode ? 'text-slate-500 group-hover:text-slate-300' : 'text-slate-400 group-hover:text-slate-700'}`}>
          Tabel Lengkap <span className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform">↗</span>
        </span>
      )}
    </div>
  </div>
);

// ==========================================================
// 2. DASHBOARD PIE CHART (Diperlebar & Rata Kanan Presisi)
// ==========================================================
const DashPieChart = ({ title, items, isGold, isDarkMode }) => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cumulative = 0;
  const data = items.map(item => ({ ...item, pct: total > 0 ? ((item.value / total) * 100).toFixed(1) : 0 })).filter(d => parseFloat(d.pct) > 0);
  const gradient = data.map((d) => {
    const start = cumulative; cumulative += parseFloat(d.pct);
    return `${d.color} ${start}% ${cumulative}%`;
  }).join(', ');

  return (
    <div className={`backdrop-blur-md rounded-2xl p-5 xl:p-6 flex items-center justify-center gap-5 xl:gap-8 h-full w-full transition-colors ${isDarkMode ? 'bg-slate-900/60 border border-slate-700/50 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-slate-800/80' : 'bg-white/90 border border-slate-200 shadow-xl hover:bg-white'}`}>
       <div className="relative w-20 h-20 xl:w-28 xl:h-28 flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(0,0,0,0.4)] flex-shrink-0" style={{ background: `conic-gradient(${gradient || '#1e293b 0% 100%'})` }}>
          <div className={`w-10 h-10 xl:w-14 xl:h-14 rounded-full shadow-inner ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`} />
       </div>
       
       {/* 1. max-w diperbesar agar gap dari teks ke angka menjadi lebih jauh dan lega */}
       <div className="flex flex-col gap-2 w-full max-w-[160px] xl:max-w-[280px] justify-center">
        
        {/* 2. justify-between dipindah ke H3 agar ujung kanan judul dan ujung kanan persen lurus sempurna */}
        <h3 className={`text-xs xl:text-sm font-bold uppercase tracking-wider ${isGold ? (isDarkMode ? 'text-amber-400' : 'text-amber-500') : (isDarkMode ? 'text-slate-400' : 'text-slate-500')} mb-1 border-b ${isDarkMode ? 'border-slate-700/50' : 'border-slate-200'} pb-1.5 flex justify-between items-center w-full`}>
          {title}
        </h3>
        
         {data.map(d => (
           <div key={d.name} className="flex justify-between items-center text-[10px] xl:text-[12px] font-bold w-full">
             <div className="flex items-center gap-2 min-w-0">
               <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
               {/* 3. max-w teks diperbesar sedikit agar teks tidak terlalu cepat terpotong */}
               <span className={`truncate max-w-[80px] xl:max-w-[120px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`} title={d.name}>{d.name}</span>
             </div>
             {/* 4. text-right ditambahkan agar persen menempel kuat ke kanan */}
             <span className={`font-mono text-[11px] xl:text-sm text-right flex-shrink-0 ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{d.pct}%</span>
           </div>
         ))}
       </div>
    </div>
  );
};

// ==========================================================
// 3. DASHBOARD BAR CHART
// ==========================================================
const DashBarChart = ({ title, items, isGold, isDarkMode }) => {
  const maxVal = Math.max(...items.map(d => d.value), 1);
  return (
    <div className={`backdrop-blur-md rounded-2xl p-4 xl:p-5 flex flex-col h-full w-full overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-900/60 border border-slate-700/50 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-slate-800/80' : 'bg-white/90 border border-slate-200 shadow-xl hover:bg-white'}`}>
      <h3 className={`text-[11px] xl:text-[13px] font-bold uppercase tracking-wider text-center ${isGold ? (isDarkMode ? 'text-amber-400' : 'text-amber-500') : (isDarkMode ? 'text-slate-400' : 'text-slate-500')} mb-2 border-b ${isDarkMode ? 'border-slate-700/50' : 'border-slate-200'} pb-1.5 flex-shrink-0`}>{title}</h3>
       <div className="flex-1 flex items-end justify-around gap-2 xl:gap-4 mt-1 pb-1 min-h-0">
         {items.map(d => {
           return (
             <div key={d.name} className="flex flex-col items-center justify-end h-full w-full gap-1.5 group min-h-0">
               <span className={`text-[11px] xl:text-xs font-mono font-bold transition-colors flex-shrink-0 ${isDarkMode ? 'text-slate-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-900'}`}>{d.value}</span>
               <div className={`w-full max-w-[28px] xl:max-w-[40px] rounded-t-md relative flex flex-col justify-end flex-1 overflow-hidden shadow-inner border-b ${isDarkMode ? 'bg-slate-800/80 border-slate-600' : 'bg-slate-100 border-slate-300'}`}>
                 <div className="w-full rounded-t-md transition-all duration-1000 ease-out shadow-[0_-5px_10px_rgba(0,0,0,0.4)] group-hover:opacity-80" style={{ height: `${(d.value / maxVal) * 100}%`, backgroundColor: d.color }} />
               </div>
               <span className={`text-[9px] xl:text-[10px] font-bold uppercase tracking-wider drop-shadow-md flex-shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{d.name}</span>
             </div>
           )
         })}
       </div>
    </div>
  );
};

export default function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const areaBoundsRef = useRef({});
  const provinceCentroidsRef = useRef({ type: 'FeatureCollection', features: [] });

  // Cek apakah di memori browser sudah ada tiket login sebelumnya
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('jarkomdat_session') === 'true');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // STATE UNTUK MODE TERANG/GELAP & WAKTU REAL-TIME
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // EFEK UNTUK UPDATE WAKTU SETIAP DETIK
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [rawData, setRawData] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [areaBounds, setAreaBounds] = useState({});
  
  const [clickedSite, setClickedSite] = useState(null);
  const [clickedRegion, setClickedRegion] = useState(null);

  const [isFilterOpen, setIsFilterOpen] = useState(false); 
  const [isDetailOpen, setIsDetailOpen] = useState(false); 
  const [isHierarchyOpen, setIsHierarchyOpen] = useState(false); 

  const [selectedModal, setSelectedModal] = useState(null); 
  const [currentBasemap, setCurrentBasemap] = useState('osm');
  const [styleLoaded, setStyleLoaded] = useState(0);

  const [searchId, setSearchId] = useState('');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [selectedStructures, setSelectedStructures] = useState([]);
  const [isStructureDropdownOpen, setIsStructureDropdownOpen] = useState(false);

  const [selectedProviders, setSelectedProviders] = useState([]);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);

  const [selectedBandwidths, setSelectedBandwidths] = useState([]);
  const [isBandwidthDropdownOpen, setIsBandwidthDropdownOpen] = useState(false);

  const [activeAvFilters, setActiveAvFilters] = useState(['green', 'yellow', 'red', 'black']);

  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  const [selProv, setSelProv] = useState('');
  const [selKab, setSelKab] = useState('');
  const [selKec, setSelKec] = useState('');
  const [selKel, setSelKel] = useState('');

  const [selectedPieData, setSelectedPieData] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(4.5);
  const [isClustered, setIsClustered] = useState(false);
  const [showMap, setShowMap] = useState(false);

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
      .then((data) => {
        setAreaBounds(data);
        areaBoundsRef.current = data; // ← TAMBAHKAN INI
      })
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

  const uniqueTypes = useMemo(() => {
    const types = rawData.map(f => normalizeTipeKoneksi(f.properties.type_koneksi));
    return [...new Set(types)].filter(Boolean).sort();
  }, [rawData]);
  const uniqueStructures = useMemo(() => [...new Set(rawData.map(f => f.properties.STRUKTUR))].filter(Boolean).sort(), [rawData]);

  const uniqueProviders = useMemo(() => {
    return [...new Set(rawData.map(f => f.properties.Provider))]
      .filter(p => p && String(p).trim() !== '' && String(p).trim() !== '-' && String(p).toUpperCase() !== 'N/A')
      .sort();
  }, [rawData]);

  const uniqueBandwidths = useMemo(() => {
    return [...new Set(rawData.map(f => f.properties.bandwidth))]
      .filter(b => b && String(b).trim() !== '' && String(b).toUpperCase() !== 'N/A')
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })); 
      // localeCompare numeric true agar "2 Mbps" muncul sebelum "10 Mbps"
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

  // useEffect 1: Hanya handle FLY TO saat hierarki berubah
  useEffect(() => {
    if (!mapReady || !map.current || Object.keys(areaBounds).length === 0) return;

    const CARD_BOTTOM = 260;
    const DETAIL_LEFT = isDetailOpen ? 370 : 60;
    const HIERARCHY_RIGHT = isHierarchyOpen ? 340 : 60;
    const TOP = 80;
    const padding = { top: TOP, bottom: CARD_BOTTOM, left: DETAIL_LEFT, right: HIERARCHY_RIGHT };

    // Tidak ada hierarki aktif sama sekali → kembali ke nasional
    if (!selProv) {
      map.current.flyTo({ center: [118.0, -4.0], zoom: 4.5, duration: 1500 });
      return;
    }

    // Hanya provinsi aktif, kabupaten di-reset → zoom ke provinsi
    if (selProv && !selKab) {
      const bounds = areaBounds[selProv];
      if (bounds) {
        const [minLng, minLat, maxLng, maxLat] = bounds;
        map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding, maxZoom: 14, duration: 1500 });
      }
      return;
    }

    // Provinsi + kabupaten aktif, kecamatan di-reset → zoom ke kabupaten
    if (selProv && selKab && !selKec) {
      const key = `${selProv}||${selKab}`;
      const bounds = areaBounds[key];
      if (bounds) {
        const [minLng, minLat, maxLng, maxLat] = bounds;
        map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding, maxZoom: 14, duration: 1500 });
      }
      return;
    }

    // Provinsi + kabupaten + kecamatan aktif, kelurahan di-reset → zoom ke kecamatan
    if (selProv && selKab && selKec && !selKel) {
      const key = `${selProv}||${selKab}||${selKec}`;
      const bounds = areaBounds[key];
      if (bounds) {
        const [minLng, minLat, maxLng, maxLat] = bounds;
        map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding, maxZoom: 14, duration: 1500 });
      }
      return;
    }

    // Semua level aktif → zoom ke kelurahan
    if (selProv && selKab && selKec && selKel) {
      const key = `${selProv}||${selKab}||${selKec}||${selKel}`;
      const bounds = areaBounds[key];
      if (bounds) {
        const [minLng, minLat, maxLng, maxLat] = bounds;
        map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding, maxZoom: 14, duration: 1500 });
      }
      return;
    }

  }, [selProv, selKab, selKec, selKel, mapReady, areaBounds]);

  // useEffect 2: Hanya update padding saat panel buka/tutup TANPA fly ulang
  useEffect(() => {
    if (!mapReady || !map.current || Object.keys(areaBounds).length === 0) return;

    let key = '';
    if (selKel) key = `${selProv}||${selKab}||${selKec}||${selKel}`;
    else if (selKec) key = `${selProv}||${selKab}||${selKec}`;
    else if (selKab) key = `${selProv}||${selKab}`;
    else if (selProv) key = selProv;

    // Hanya jalankan fitBounds ulang jika ada hierarki aktif
    if (!key) return;

    const bounds = areaBounds[key];
    if (bounds) {
      const [minLng, minLat, maxLng, maxLat] = bounds;

      const CARD_BOTTOM = 260;
      const DETAIL_LEFT = isDetailOpen ? 370 : 60;
      const HIERARCHY_RIGHT = isHierarchyOpen ? 340 : 60;
      const TOP = 80;

      map.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]], 
        { 
          padding: { top: TOP, bottom: CARD_BOTTOM, left: DETAIL_LEFT, right: HIERARCHY_RIGHT }, 
          maxZoom: 14, 
          duration: 800 
        }
      );
    }
  }, [isDetailOpen, isHierarchyOpen]); // ← Hanya reaktif terhadap panel

  const filteredFeatures = useMemo(() => {
    if (!hasData) return [];

    return rawData.filter((feature) => {
      const props = feature.properties;
      
      // Filter Multi-Month Range
      if (activeMonths.length > 0 && !activeMonths.includes(props.monthReportv2)) return false;
      
      const normalizedType = normalizeTipeKoneksi(props.type_koneksi);
      
      // Filter Tipe Koneksi (Multi-Select)
      if (selectedTypes.length > 0) {
        const normalizedType = normalizeTipeKoneksi(props.type_koneksi);
        if (!selectedTypes.includes(normalizedType)) return false;
      }
      // Filter Struktur (Multi-Select)
      if (selectedStructures.length > 0 && !selectedStructures.includes(props.STRUKTUR)) return false;
      
      if (selectedProviders.length > 0) {
        const pStr = props.Provider ? String(props.Provider).trim() : '';
        if (!selectedProviders.includes(pStr)) return false;
      }

      // Filter Bandwidth (Multi-Select)
      if (selectedBandwidths.length > 0) {
        const bwStr = props.bandwidth ? String(props.bandwidth).trim() : '';
        if (!selectedBandwidths.includes(bwStr)) return false;
      }

      if (searchId) {
        const term = searchId.toLowerCase();
        const matchId = props.kodesite && String(props.kodesite).toLowerCase().includes(term);
        const matchName = props["NAMA SITE"] && String(props["NAMA SITE"]).toLowerCase().includes(term);
        if (!matchId && !matchName) return false;
      }

      // Filter Nilai AV (Legenda Interaktif)
      const avVal = parseSLA(props.AV) * 100;
      let avCat = 'black';
      if (avVal >= 90) avCat = 'green';
      else if (avVal >= 50) avCat = 'yellow';
      else if (avVal > 0) avCat = 'red';
      else avCat = 'black';

      if (!activeAvFilters.includes(avCat)) return false;
      
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
  }, [rawData, searchId, selectedTypes, selectedProviders, selectedStructures, selectedBandwidths, activeMonths, hasData, selProv, selKab, selKec, selKel, activeAvFilters]);

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

  const providerMetrics = useMemo(() => {
    let telkom = 0, xl = 0, icon = 0, telkomIcon = 0, telkomXl = 0;
    filteredFeatures.forEach(f => {
      const p = String(f.properties.Provider || '').toUpperCase();
      const hasTelkom = p.includes('TELKOM');
      const hasXl = p.includes('XL');
      const hasIcon = p.includes('ICON');
      
      if (hasTelkom && hasIcon) telkomIcon++;
      else if (hasTelkom && hasXl) telkomXl++;
      else if (hasTelkom && !hasXl && !hasIcon) telkom++;
      else if (hasXl && !hasTelkom) xl++;
      else if (hasIcon && !hasTelkom) icon++;
    });
    return { telkom, xl, icon, telkomIcon, telkomXl };
  }, [filteredFeatures]);

  const trendData = useMemo(() => {
    // Trendline tidak terpengaruh oleh slider range waktu, agar selalu menunjukkan seluruh tahun
    const spatialFiltered = rawData.filter(f => {
      const props = f.properties;
      const normalizedType = normalizeTipeKoneksi(props.type_koneksi);
      // Filter Tipe Koneksi (Multi-Select)
      if (selectedTypes.length > 0) {
        const normalizedType = normalizeTipeKoneksi(props.type_koneksi);
        if (!selectedTypes.includes(normalizedType)) return false;
      } 
      // Filter Struktur (Multi-Select)
      if (selectedStructures.length > 0 && !selectedStructures.includes(props.STRUKTUR)) return false;
      
      if (selectedProviders.length > 0) {
        const pStr = props.Provider ? String(props.Provider).trim() : '';
        if (!selectedProviders.includes(pStr)) return false;
      }

      // Filter Bandwidth (Multi-Select)
      if (selectedBandwidths.length > 0) {
        const bwStr = props.bandwidth ? String(props.bandwidth).trim() : '';
        if (!selectedBandwidths.includes(bwStr)) return false;
      }
      
      // Filter Nilai AV (Legenda Interaktif)
      const avVal = parseSLA(props.AV) * 100;
      let avCat = 'black';
      if (avVal >= 90) avCat = 'green';
      else if (avVal >= 50) avCat = 'yellow';
      else if (avVal > 0) avCat = 'red';
      else avCat = 'black';

      if (!activeAvFilters.includes(avCat)) return false;

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
  }, [rawData, selectedTypes, selectedStructures, selectedProviders, selectedBandwidths, selProv, selKab, selKec, selKel, activeAvFilters]);

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

    // FORMATTER TIPE KONEKSI (Terhubung ke normalizer di atas)
    const formatTipeKoneksi = (val) => normalizeTipeKoneksi(val);

    return {
      tipe: countBy('type_koneksi', formatTipeKoneksi),
      provider: countBy('Provider'),
      struktur: countBy('STRUKTUR', formatStruktur),
      bandwidth: countBy('bandwidth')
    };
  }, [filteredFeatures]);

  // ==========================================================
  // DATA CENTROID PROVINSI (Untuk Cluster Awal)
  // ==========================================================
  const provinceCentroids = useMemo(() => {
    const provData = {};
    
    filteredFeatures.forEach(f => {
      // Ambil nama provinsi dengan field yang tersedia
      const prov = f.properties.nama_prop || f.properties.PROVINSI || f.properties.provinsi;
      if (!prov) return;
      
      const [lng, lat] = f.geometry.coordinates;
      if (!provData[prov]) {
        provData[prov] = { count: 0, sumLng: 0, sumLat: 0 };
      }
      provData[prov].count += 1;
      provData[prov].sumLng += lng;
      provData[prov].sumLat += lat;
    });

    const features = Object.keys(provData).map(prov => {
      const d = provData[prov];
      return {
        type: 'Feature',
        properties: { provinsi: prov, count: d.count },
        geometry: { type: 'Point', coordinates: [d.sumLng / d.count, d.sumLat / d.count] }
      };
    });

    return { type: 'FeatureCollection', features };
  }, [filteredFeatures]);

  // ==========================================================
  // EFEK PENYINKRON: Update data popup jika filter berubah
  // ==========================================================
  useEffect(() => {
    setSelectedPieData((prevSnapshot) => {
      if (!prevSnapshot) return null; // Abaikan jika popup sedang ditutup
      
      let updatedData = [];
      // Teks di sini HARUS sama persis dengan title="..." pada DonutStat
      if (prevSnapshot.title === 'Tipe Koneksi') updatedData = summaryData.tipe;
      else if (prevSnapshot.title === 'Provider') updatedData = summaryData.provider;
      else if (prevSnapshot.title === 'Struktur') updatedData = summaryData.struktur;
      else if (prevSnapshot.title === 'Kapasitas Bandwidth') updatedData = summaryData.bandwidth;
      
      // Kembalikan objek popup dengan data yang paling fresh!
      return { title: prevSnapshot.title, data: updatedData };
    });
  }, [summaryData]);

  useEffect(() => {
    // 1. Tahan proses jika belum login atau kontainer peta belum ada
    if (!isLoggedIn || !mapContainer.current) return;
    
    // 2. Bungkus inisialisasi di dalam kondisi jika map belum dibuat
    if (!map.current) {
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
        attributionControl: false
      });

      map.current.addControl(new maplibregl.AttributionControl({
        compact: true
      }), 'bottom-right');

      const loadLayers = () => {
        if (!map.current.getSource('batas-desa')) {
          const baseUrl = window.location.href.split('#')[0].replace(/\/$/, '') + '/';
          map.current.addSource('batas-desa', { type: 'vector', url: `pmtiles://${baseUrl}batas_administrasi.pmtiles` });
          map.current.addLayer({ id: 'batas-desa-fill', type: 'fill', source: 'batas-desa', 'source-layer': 'batas_administrasi_clean', paint: { 'fill-color': '#111827', 'fill-opacity': currentBasemap === 'dark' ? 0.55 : 0.25 } });
          map.current.addLayer({ id: 'batas-desa-line', type: 'line', source: 'batas-desa', 'source-layer': 'batas_administrasi_clean', paint: { 'line-color': currentBasemap === 'dark' ? '#334155' : '#64748b', 'line-width': 0.2, 'line-opacity': 0.6 } });
        }

        // =======================================================
        // KONFIGURASI 4 KATEGORI WARNA AV (DIBUAT OTOMATIS)
        // =======================================================
        const avCategories = [
          { id: 'green', color: '#10b981', halo: 'rgba(16, 185, 129, 0.8)' },
          { id: 'yellow', color: '#facc15', halo: 'rgba(250, 204, 21, 0.8)', text: '#0f172a' }, // Teks gelap khusus kuning
          { id: 'red', color: '#ef4444', halo: 'rgba(239, 68, 68, 0.8)' },
          { id: 'black', color: '#1e293b', halo: 'rgba(30, 41, 59, 0.8)' } // Slate tua agar tak hilang di peta Dark
        ];

        avCategories.forEach(cat => {
          // LAYER CLUSTER
          if (!map.current.getSource(`titik-site-${cat.id}`)) {
            map.current.addSource(`titik-site-${cat.id}`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 14, clusterRadius: 50 });
            map.current.addLayer({ id: `clusters-${cat.id}`, type: 'circle', source: `titik-site-${cat.id}`, filter: ['has', 'point_count'], minzoom: 5.5, paint: { 'circle-color': cat.color, 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 26, 50, 34], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
            map.current.addLayer({ id: `cluster-count-${cat.id}`, type: 'symbol', source: `titik-site-${cat.id}`, filter: ['has', 'point_count'], minzoom: 5.5, layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': cat.text || '#ffffff', 'text-halo-color': cat.halo, 'text-halo-width': 1.5 } });
            map.current.addLayer({ id: `unclustered-${cat.id}`, type: 'circle', source: `titik-site-${cat.id}`, filter: ['!', ['has', 'point_count']], minzoom: 5.5, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 12, 12], 'circle-color': cat.color, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' } });
          }
          // LAYER RAW
          if (!map.current.getSource(`titik-site-${cat.id}-raw`)) {
            map.current.addSource(`titik-site-${cat.id}-raw`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.current.addLayer({ id: `raw-${cat.id}`, type: 'circle', source: `titik-site-${cat.id}-raw`, layout: { visibility: 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 12, 9], 'circle-color': cat.color, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
          }
        });
        // LAYER BARU: CLUSTER PROVINSI (Hanya muncul saat Zoom < 5.5)
        if (!map.current.getSource('province-centroids')) {
          map.current.addSource('province-centroids', { type: 'geojson', data: provinceCentroidsRef.current });
          
          map.current.addLayer({
            id: 'province-clusters',
            type: 'circle',
            source: 'province-centroids',
            maxzoom: 5.5, // Otomatis hilang jika di-zoom in
            paint: {
              'circle-color': '#0ea5e9', // Warna Sky Blue 
              'circle-radius': 20,       // <-- DIUBAH: Ukuran disamakan semua menjadi 20px
              'circle-stroke-width': 2,
              'circle-stroke-color': '#0f172a'
            }
          });

          map.current.addLayer({
            id: 'province-cluster-count',
            type: 'symbol',
            source: 'province-centroids',
            maxzoom: 5.5,
            layout: { 
              'text-field': '{count}',
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 
              'text-size': 14, // Sedikit dikecilkan agar pas di dalam lingkaran statis
              'text-allow-overlap': true, 
              'text-ignore-placement': true 
            },
            paint: { 'text-color': '#ffffff' }
          });
          
          // Layer 'province-cluster-label' (Teks Nama Provinsi) SUDAH DIHAPUS dari sini
          }
          setStyleLoaded(Date.now());
        };

      map.current.on('load', loadLayers);
      map.current.on('style.load', loadLayers);

      // =======================================================
      // KUMPULAN EVENT LISTENER KLIK & HOVER MOUSE
      // =======================================================
      map.current.on('click', 'province-clusters', (e) => {
        const provName = e.features[0].properties.provinsi;
        const boundsData = areaBoundsRef.current;
        const matchedKey = Object.keys(boundsData).find(k => k === provName || k.toUpperCase() === provName?.toUpperCase());
        if (matchedKey && boundsData[matchedKey]) {
          const [minLng, minLat, maxLng, maxLat] = boundsData[matchedKey];
          map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 80, bottom: 260, left: 60, right: 60 }, maxZoom: 10, duration: 1500 });
        } else {
          map.current.flyTo({ center: e.features[0].geometry.coordinates, zoom: 6.5, duration: 1500 });
        }
      });

      map.current.on('mouseenter', 'province-clusters', () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', 'province-clusters', () => { map.current.getCanvas().style.cursor = ''; });

      // ARRAY LAYER UNTUK INTERAKSI
      const unclusteredLayers = ['unclustered-green', 'unclustered-yellow', 'unclustered-red', 'unclustered-black', 'raw-green', 'raw-yellow', 'raw-red', 'raw-black'];
      const clusterLayers = ['clusters-green', 'clusters-yellow', 'clusters-red', 'clusters-black'];

      unclusteredLayers.forEach(layer => {
        map.current.on('click', layer, (e) => {
          if (e.features.length > 0) { setClickedSite(e.features[0].properties); setClickedRegion(null); setIsDetailOpen(true); }
        });
      });

      clusterLayers.forEach(layer => {
        map.current.on('click', layer, async (e) => {
          const features = map.current.queryRenderedFeatures(e.point, { layers: [layer] });
          if (!features.length) return;

          const clusterId = features[0].properties.cluster_id;
          const pointCount = features[0].properties.point_count;
          const sourceId = layer.replace('clusters-', 'titik-site-'); // Menerjemahkan nama layer menjadi ID source

          try {
            const leafFeatures = await map.current.getSource(sourceId).getClusterLeaves(clusterId, pointCount, 0);
            if (!leafFeatures || leafFeatures.length === 0) return;

            let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
            leafFeatures.forEach(f => {
              const [lng, lat] = f.geometry.coordinates;
              if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat; if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
            });

            if (minLng === maxLng && minLat === maxLat) {
              map.current.flyTo({ center: [minLng, minLat], zoom: 14, duration: 1500 });
            } else {
              map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 100, bottom: 280, left: 80, right: 80 }, maxZoom: 14, duration: 1500 });
            }
          } catch (err) { console.error('getClusterLeaves error:', err); }
        });
      });

      map.current.on('click', 'batas-desa-fill', (e) => {
        const titikFeatures = map.current.queryRenderedFeatures(e.point, { layers: [...unclusteredLayers, ...clusterLayers] });
        if (titikFeatures.length > 0) return;
        if (e.features.length > 0) { setClickedRegion(e.features[0].properties); setClickedSite(null); setIsDetailOpen(true); }
      });

      map.current.on('mousemove', (e) => {
        if (!map.current.getLayer('unclustered-green') || !map.current.getLayer('batas-desa-fill')) return;
        try {
          const features = map.current.queryRenderedFeatures(e.point, { layers: [...unclusteredLayers, ...clusterLayers, 'batas-desa-fill'] });
          if (features.length > 0) { map.current.getCanvas().style.cursor = 'pointer'; } else { map.current.getCanvas().style.cursor = ''; }
        } catch (err) {}
      });

      setMapReady(true);
    }

    // ======================================================================
    // 3. TAMBAHKAN BLOK RETURN CLEANUP INI (DI PALING BAWAH EFFECT SEBELUM GUNTING DEPENDENSI)
    // ======================================================================
    return () => {
      if (map.current) {
        map.current.remove(); // Menghancurkan instance canvas peta & WebGL Context sampai akar-akarnya
        map.current = null;   // Me-reset referensi objek menjadi kosong kembali
        setMapReady(false);   // Mematikan flag kesiapan peta
      }
    };
    
  }, [isLoggedIn]);

  // ==========================================================
  // EFEK PENYINKRON: Update posisi Centroid Provinsi jika Filter Berubah
  // ==========================================================
  useEffect(() => {
    if (mapReady && map.current) {
      const provSource = map.current.getSource('province-centroids');
      if (provSource) {
        provSource.setData(provinceCentroids);
      }
    }
  }, [provinceCentroids, mapReady, styleLoaded]);

  useEffect(() => {
    provinceCentroidsRef.current = provinceCentroids;
  }, [provinceCentroids]);

  useEffect(() => {
    if (map.current && mapReady) {
      const styles = {
        dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        osm: { version: 8, sources: { 'osm-tiles': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OSM' } }, layers: [{ id: 'osm-layer', type: 'raster', source: 'osm-tiles' }] }
      };
      map.current.setStyle(styles[currentBasemap]);
    }
  }, [currentBasemap, mapReady]);

  // ==========================================================
  // 1. EFEK PENYUAP DATA (BERDASARKAN 4 WARNA AV)
  // ==========================================================
  useEffect(() => {
    if (!mapReady || !map.current || !styleLoaded) return;

    const sources = ['green', 'yellow', 'red', 'black'];
    const hasAllSources = sources.every(s => map.current.getSource(`titik-site-${s}`) && map.current.getSource(`titik-site-${s}-raw`));
    
    if (hasAllSources) {
      const dataGreen = [];
      const dataYellow = [];
      const dataRed = [];
      const dataBlack = [];

      // Logika Pemisahan berdasarkan AV
      filteredFeatures.forEach(f => {
        const av = parseSLA(f.properties.AV) * 100;
        if (av >= 90) dataGreen.push(f);
        else if (av >= 50) dataYellow.push(f);
        else if (av > 0) dataRed.push(f);
        else dataBlack.push(f);
      });
      
      const dummyPoint = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { status_link: 'DUMMY' } };

      // Suntikkan data ke masing-masing wadah warna
      sources.forEach(s => {
        const data = s === 'green' ? dataGreen : s === 'yellow' ? dataYellow : s === 'red' ? dataRed : dataBlack;
        const payload = { type: 'FeatureCollection', features: data.length > 0 ? data : [dummyPoint] };
        
        map.current.getSource(`titik-site-${s}`).setData(payload);
        map.current.getSource(`titik-site-${s}-raw`).setData(payload);
      });
    }
  }, [filteredFeatures, mapReady, styleLoaded]);


  // ==========================================================
  // 2. EFEK TOGGLE CLUSTER (MENGATUR ON/OFF VISIBILITY)
  // ==========================================================
  useEffect(() => {
    if (!mapReady || !map.current || !styleLoaded) return;

    // Masukkan 4 warna ke daftar Cluster
    const clusteredLayers = [
      'clusters-green', 'cluster-count-green', 'unclustered-green',
      'clusters-yellow', 'cluster-count-yellow', 'unclustered-yellow',
      'clusters-red', 'cluster-count-red', 'unclustered-red',
      'clusters-black', 'cluster-count-black', 'unclustered-black',
      'province-clusters', 'province-cluster-count'
    ];
    
    // Masukkan 4 warna ke daftar Murni (Raw)
    const rawLayers = ['raw-green', 'raw-yellow', 'raw-red', 'raw-black'];

    clusteredLayers.forEach(layer => {
      if (map.current.getLayer(layer)) {
        map.current.setLayoutProperty(layer, 'visibility', isClustered ? 'visible' : 'none');
      }
    });

    rawLayers.forEach(layer => {
      if (map.current.getLayer(layer)) {
        map.current.setLayoutProperty(layer, 'visibility', isClustered ? 'none' : 'visible');
      }
    });

  }, [isClustered, mapReady, styleLoaded]);

  useEffect(() => {
    if (!mapReady || !map.current || !styleLoaded || listProvinsi.length === 0) return;

    const applyMapStyle = () => {
      // ============================================
      // MODE 1: FILTER HIERARKI AKTIF (manual select)
      // ============================================
      if (selProv || selKab || selKec || selKel) {
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
        if (selKec) { targetProp = 'nama_kel'; colorsList = listKelurahan; }
        else if (selKab) { targetProp = 'nama_kec'; colorsList = listKecamatan; }
        else if (selProv) { targetProp = 'nama_kab'; colorsList = listKabupaten; }

        if (colorsList.length > 0 && map.current.getLayer('batas-desa-fill')) {
          const matchExpression = ['match', ['get', targetProp]];
          colorsList.forEach((val, index) => {
            const hue = (index * 137.5) % 360;
            matchExpression.push(val, `hsl(${hue}, 65%, 35%)`);
          });
          matchExpression.push('rgba(0,0,0,0)');
          map.current.setPaintProperty('batas-desa-fill', 'fill-color', matchExpression);
        }
        return;
      }

      // ============================================
      // MODE 2: AUTO ZOOM (tidak ada hierarki aktif)
      // ============================================
      if (!map.current) return;
      const zoom = map.current.getZoom();

      // Reset filter
      if (map.current.getLayer('batas-desa-fill')) map.current.setFilter('batas-desa-fill', null);
      if (map.current.getLayer('batas-desa-line')) map.current.setFilter('batas-desa-line', null);

      if (!map.current.getLayer('batas-desa-fill')) return;

      if (zoom < 6) {
        // LEVEL PROVINSI: match expression aman (hanya 38 provinsi)
        const matchExpression = ['match', ['get', 'nama_prop']];
        listProvinsi.forEach((val, index) => {
          const hue = (index * 137.5) % 360;
          matchExpression.push(val, `hsl(${hue}, 55%, 32%)`);
        });
        matchExpression.push('#1e293b');
        map.current.setPaintProperty('batas-desa-fill', 'fill-color', matchExpression);

      } else if (zoom < 8) {
        // LEVEL KABUPATEN: match expression masih aman (±500 kabupaten)
        const colorsList = [...new Set(Object.keys(areaBounds).map(k => k.split('||')[1]).filter(Boolean))];
        const matchExpression = ['match', ['get', 'nama_kab']];
        colorsList.forEach((val, index) => {
          const hue = (index * 137.5) % 360;
          matchExpression.push(val, `hsl(${hue}, 55%, 32%)`);
        });
        matchExpression.push('#1e293b');
        map.current.setPaintProperty('batas-desa-fill', 'fill-color', matchExpression);

      } else {
        // LEVEL KECAMATAN & KELURAHAN
        // Pakai step expression dengan palet 12 warna berdasarkan panjang nama
        // Valid di MapLibre dan dihitung di GPU
        const targetProp = zoom >= 10 ? 'nama_kel' : 'nama_kec';
        const palette = [
          '#1a4731', '#1a3a47', '#2d1a47', '#47261a',
          '#1a4720', '#47421a', '#471a1a', '#1a4742',
          '#3d471a', '#1a2847', '#471a3d', '#2a471a'
        ];
        map.current.setPaintProperty('batas-desa-fill', 'fill-color', [
          'step',
          ['%', ['length', ['coalesce', ['get', targetProp], '']], 12],
          palette[0],
          1, palette[1],
          2, palette[2],
          3, palette[3],
          4, palette[4],
          5, palette[5],
          6, palette[6],
          7, palette[7],
          8, palette[8],
          9, palette[9],
          10, palette[10],
          11, palette[11]
        ]);
      }
    };

    // Debounce zoom (Ubah dari yang lama menjadi ini)
    let debounceTimer;
    const debouncedApply = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyMapStyle();
        // Update angka zoom untuk Gauge Meter!
        if (map.current) setCurrentZoom(map.current.getZoom());
      }, 200);
    };

    map.current.on('zoom', debouncedApply);

    // Jalankan langsung saat mount / dependensi berubah
    applyMapStyle();

    return () => {
      if (map.current) map.current.off('zoom', debouncedApply);
      clearTimeout(debounceTimer);
    };

  }, [mapReady, styleLoaded, selProv, selKab, selKec, selKel, listProvinsi, listKabupaten, listKecamatan, listKelurahan, areaBounds]);

  const formatStruktur = (val) => {
    if (val === 'KAB-KOTA') return 'KABUPATEN / KOTA';
    if (val === 'KELURAHAN') return 'KELURAHAN / DESA';
    return val;
  };

  const renderField = (level, val) => {
    // 1. Jika nilai kosong, kembalikan strip
    if (!val || String(val).trim() === '' || String(val).toLowerCase() === 'undefined') return '-';
    
    // 2. Jika yang diminta adalah kolom struktur, langsung format dan tampilkan
    if (level === 'struct') return formatStruktur(val);

    // 3. Logika penyembunyian hierarki wilayah yang benar
    if (clickedSite && clickedSite.STRUKTUR) {
      const struct = clickedSite.STRUKTUR.toUpperCase();
      if (struct === 'PROVINSI') { 
        if (level === 'kab' || level === 'kec' || level === 'kel') return '-'; 
      } 
      else if (struct === 'KAB-KOTA' || struct === 'KABUPATEN') { 
        if (level === 'kec' || level === 'kel') return '-'; 
      } 
      else if (struct === 'KECAMATAN') { 
        if (level === 'kel') return '-'; 
      }
    }
    
    return val;
  };

  const modalTableData = useMemo(() => {
    if (!selectedModal) return [];
    
    // Baris 1: Status Utama
    if (selectedModal === 'total') return filteredFeatures;
    if (selectedModal === 'online') return filteredFeatures.filter(f => f.properties.status_link === 'AKTIF');
    if (selectedModal === 'offline') return filteredFeatures.filter(f => f.properties.status_link === 'TIDAK AKTIF');

    // Baris 2: Provider Eksklusif (Only / Dual)
    if (selectedModal === 'telkom_only') return filteredFeatures.filter(f => {
      const p = String(f.properties.Provider || '').toUpperCase();
      return p.includes('TELKOM') && !p.includes('XL') && !p.includes('ICON');
    });
    if (selectedModal === 'xl_only') return filteredFeatures.filter(f => {
      const p = String(f.properties.Provider || '').toUpperCase();
      return p.includes('XL') && !p.includes('TELKOM');
    });
    if (selectedModal === 'icon_only') return filteredFeatures.filter(f => {
      const p = String(f.properties.Provider || '').toUpperCase();
      return p.includes('ICON') && !p.includes('TELKOM');
    });
    if (selectedModal === 'telkom_icon') return filteredFeatures.filter(f => {
      const p = String(f.properties.Provider || '').toUpperCase();
      return p.includes('TELKOM') && p.includes('ICON');
    });
    if (selectedModal === 'telkom_xl') return filteredFeatures.filter(f => {
      const p = String(f.properties.Provider || '').toUpperCase();
      return p.includes('TELKOM') && p.includes('XL');
    });

    // Baris 3: Total Provider Gabungan
    if (selectedModal === 'total_telkom') return filteredFeatures.filter(f => String(f.properties.Provider || '').toUpperCase().includes('TELKOM'));
    if (selectedModal === 'total_xl') return filteredFeatures.filter(f => String(f.properties.Provider || '').toUpperCase().includes('XL'));
    if (selectedModal === 'total_icon') return filteredFeatures.filter(f => String(f.properties.Provider || '').toUpperCase().includes('ICON'));

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
    const headers = ['Kode Site', 'Nama Site', 'Provinsi', 'Kabupaten', 'Koneksi', 'Provider', 'Struktur', 'Bandwidth', 'SLA (AV) %', 'Status'];

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

  // --- TAMBAHKAN LOGIKA INTERSEPTOR LOGIN INI ---
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin123') {
      setIsLoggedIn(true);
      setLoginError('');
      // SIMPAN SESI KE MEMORI BROWSER
      localStorage.setItem('jarkomdat_session', 'true');
    } else {
      setLoginError('Kredensial salah! Silakan periksa kembali.');
    }
  };

  // FUNGSI BARU: UNTUK LOGOUT
  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    // HAPUS SESI DARI MEMORI BROWSER
    localStorage.removeItem('jarkomdat_session');
  };

  // Jika belum login, render halaman login dengan layout Split 50-50 & Ornamen Keren
  if (!isLoggedIn) {
    return (
      <div className="w-screen h-screen flex bg-slate-950 font-sans antialiased overflow-hidden relative">
        
        {/* ==============================================================================
            SISI KIRI (50%): Gambar Ilustrasi & Judul Utama
            ============================================================================== */}
        <div 
          className="w-1/2 h-full bg-slate-900 border-r border-slate-800 relative bg-cover bg-center overflow-hidden group"
          // --- 👇👇👇 GANTI URL GAMBAR DI SINI 👇👇👇 ---
          style={{ backgroundImage: "url('./stadia-maps.png')" }}
          // URL Contoh di atas adalah gambar teknis sirkuit. Silakan ganti dengan aset gambar WebGIS Anda.
        >
            {/* Overlay Warna Gelap di atas gambar agar teks terbaca */}
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] group-hover:backdrop-blur-0 transition-all duration-500"></div>
            
            {/* Ornamen Grid Teknis di sisi Kiri */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcmVjdD0iMCAwIDIwIDIwIiBmaWxsPSJub25lIj48cGF0aCBkPSJNMjAgMEgwVjIwSDIwVjBaTTUgNUgxNVYxNUg1VjVaIiBmaWxsPSIjMTcxNzE3IiBmaWxsLW9wYWNpdHk9IjAuMiIvPjwvc3ZnPg==')] opacity-30 pointer-events-none" />

            {/* Konten Teks di Sisi Kiri */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-10 w-full max-w-lg px-12 pointer-events-none">
              <div className="w-16 h-1.5 bg-emerald-500 mb-6 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.8)] mx-auto"></div>
              <h1 className="text-5xl font-extrabold tracking-tighter text-white uppercase leading-none drop-shadow-2xl">
                SISTEM MONITORING <br/>
                <span className="text-emerald-400">JARKOMDAT</span>
              </h1>
              {/* Deskripsi dihilangkan di sini sesuai permintaan */}
            </div>

            {/* Ornamen Sudut Teknis Kiri Bawah */}
            <div className="absolute bottom-6 left-6 text-[10px] font-mono text-slate-600 uppercase tracking-widest z-10 flex items-center gap-2">
                <div className="w-8 h-[1px] bg-slate-700"></div>
                Integrated Geospatial Network Intelligence
            </div>
        </div>

        {/* ==============================================================================
            SISI KANAN (50%): Form Login & Ornamen Glow
            ============================================================================== */}
        <div className="w-1/2 h-full bg-slate-900/50 flex items-center justify-center relative p-8">
          
          {/* ORNAMEN 1: Radial Gradient Glow Pojok Kanan Atas (Emerald) */}
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-950/20 rounded-full blur-[120px] pointer-events-none opacity-60" />
          
          {/* ORNAMEN 2: Radial Gradient Glow Pojok Kiri Bawah (Sky Blue) */}
          <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] bg-sky-950/15 rounded-full blur-[100px] pointer-events-none opacity-50" />

          {/* ORNAMEN 3: Garis Teknis Vertikal di sebelah Kiri Form */}
          <div className="absolute top-1/4 bottom-1/4 left-10 w-[1px] bg-slate-800 flex flex-col justify-between items-center py-2 pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
            <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse"></div>
          </div>

          {/* Kartu Box Login (Existing content wrapped) */}
          <div className="w-full max-w-sm bg-slate-900/80 backdrop-blur-lg border border-slate-800 p-9 rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.7)] border-t-4 border-t-emerald-500 z-10 relative overflow-hidden group/card">
              
              {/* Ornamen Grid Halus di dalam kartu */}
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIHZpZXdCb3g9IjAgMCA4IDgiPgo8ZyBmaWxsPSIjMWUxZTFlIiBmaWxsLW9wYWNpdHk9IjAuNSI+CjxjaXJjbGUgY3g9IjEiIGN5PSIxIiByPSIxIi8+CjwvZz4KPC9zdmc+')] opacity-20 pointer-events-none" />

              {/* Existing Logo & Title */}
              <div className="flex flex-col items-center mb-8 relative z-10">
                <img src="./kemendagri.svg" alt="Logo Kemendagri" className="h-16 w-16 object-contain drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] mb-3 transition-transform group-hover/card:scale-110 duration-300" />
                <h2 className="text-[11px] font-bold tracking-[0.25em] text-white uppercase text-center drop-shadow-md">Akses Masuk</h2>
              </div>
              
              {/* Existing Form with enhanced input styles */}
              <form onSubmit={handleLoginSubmit} className="w-full space-y-5 relative z-10">
                  <div>
                      <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block mb-1.5">Username</label>
                      <input 
                          type="text" 
                          placeholder="Masukkan username..." 
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-xs text-slate-200 font-semibold focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-inner"
                          required
                      />
                  </div>
                  <div>
                      <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block mb-1.5">Password</label>
                      <input 
                          type="password" 
                          placeholder="Masukkan password..." 
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-xs text-slate-200 font-semibold focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition shadow-inner"
                          required
                      />
                  </div>
                  
                  {/* Existing Error Message */}
                  {loginError && (
                      <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-[11px] text-red-400 font-medium text-center animate-pulse">
                          ⚠️ {loginError}
                      </div>
                  )}
                  
                  {/* Tombol Masuk dengan Efek Glow Hover */}
                  <button 
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase tracking-widest py-3 rounded-lg transition-all cursor-pointer shadow-[0_4px_15px_rgba(16,185,129,0.3)] mt-2 hover:shadow-[0_4px_25px_rgba(16,185,129,0.5)] active:scale-[0.98]"
                  >
                      Masuk ke Sistem
                  </button>
              </form>
              
              {/* Footer text */}
              <div className="text-[9px] text-slate-600 font-mono mt-10 text-center uppercase tracking-wider relative z-10 border-t border-slate-800 pt-4">
                  © 2026 KEMENDAGRI RI<br/>Secure Network Intelligence v1.0
              </div>
          </div>
        </div>
        
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      <div ref={mapContainer} className={`absolute inset-0 z-0 transition-opacity duration-1000 ${showMap ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />

      {/* ==========================================================
          LAYAR 1: EXECUTIVE DASHBOARD
          ========================================================== */}
      {!showMap && (
        <div className={`absolute inset-0 z-50 flex flex-col pt-6 pb-6 px-8 overflow-hidden animate-in fade-in duration-500 transition-colors ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}
            style={{
              backgroundImage: "url('./sla-images.jpg')",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "100%", 
              backgroundColor: isDarkMode ? "#020617" : "#f8fafc" // Slate-950 atau Slate-50
            }}>
            
          {/* Overlay Blur (Dinamis Gelap/Terang) */}
          <div className={`absolute inset-0 backdrop-blur-[2px] z-0 pointer-events-none transition-colors ${isDarkMode ? 'bg-slate-950/80' : 'bg-slate-100/85'}`} />

          {/* HEADER DASHBOARD */}
          <div className={`relative z-10 flex justify-between items-center mb-6 border-b pb-4 flex-shrink-0 ${isDarkMode ? 'border-slate-800/80' : 'border-slate-300'}`}>
            <div className="flex items-center gap-4">
              <img src="./kemendagri.svg" className="h-12 xl:h-14 w-12 xl:w-14 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]" />
              <div>
                <h1 className="text-2xl xl:text-3xl font-extrabold tracking-widest text-emerald-500 uppercase drop-shadow-md leading-none">
                  JARKOMDAT
                </h1>
                <h2 className={`text-[11px] xl:text-sm font-medium tracking-[0.3em] uppercase mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Dashboard Eksekutif</h2>
              </div>
            </div>
            
            {/* Waktu Real-Time, Tombol Toggles, & Logout */}
            <div className="flex items-center gap-4">
               
               {/* JAM REAL-TIME (Tampil di layar menengah ke atas, dengan garis vertikal pembatas) */}
               <div className={`hidden md:flex flex-col text-right mr-2 border-r pr-4 ${isDarkMode ? 'border-slate-700/80 text-slate-300' : 'border-slate-300 text-slate-600'}`}>
                  <span className="text-[12px] font-bold uppercase tracking-widest">
                    {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}
                  </span>
                  <span className="text-lg font-mono font-extrabold text-emerald-500 drop-shadow-sm">
                    {currentTime.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':')} WIB
                  </span>
               </div>

               <button 
                 onClick={() => setIsDarkMode(!isDarkMode)} 
                 className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest transition flex items-center gap-2 shadow-md border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-amber-500 hover:bg-slate-50'}`}
               >
                 {isDarkMode ? '☀️ MODE TERANG' : '🌙 MODE GELAP'}
               </button>
               
               <button onClick={handleLogout} className="bg-red-500/20 border border-red-500/50 hover:bg-red-500 hover:text-white text-red-500 px-6 py-2 rounded-lg text-xs font-bold tracking-widest transition shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                 LOGOUT
               </button>
            </div>
          </div>

          {/* SISA LAYAR DIBAGI 4 BARIS SAMA RATA */}
          <div className="relative z-10 flex-1 grid grid-rows-4 gap-4 xl:gap-5 min-h-[600px]">
              
             {/* BARIS 1 */}
             <div className="flex flex-row gap-4 xl:gap-5 h-full w-full">
                <div className="w-[35%] h-full">
                   <DashPieChart title="Status Site" items={[{ name: 'Online', value: metrics.online, color: '#10b981' }, { name: 'Offline', value: metrics.offline, color: '#ef4444' }]} isGold isDarkMode={isDarkMode} />
                </div>
                <div className="w-[65%] flex flex-row gap-4 xl:gap-5 h-full">
                   <div className="flex-1 min-w-0"><DashCard title="Total Site" value={metrics.total} icon="🏢" color="text-blue-500" isGold onClick={() => setSelectedModal('total')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title="Site Online" value={metrics.online} sub={`(${metrics.onlinePct}%)`} icon="✅" color="text-emerald-500" isGold onClick={() => setSelectedModal('online')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title="Site Offline" value={metrics.offline} sub={`(${metrics.offlinePct}%)`} icon="❌" color="text-red-500" isGold onClick={() => setSelectedModal('offline')} isDarkMode={isDarkMode} /></div>
                </div>
             </div>

             {/* BARIS 2 */}
             <div className="flex flex-row gap-4 xl:gap-5 h-full w-full">
                <div className="w-[35%] h-full">
                   <DashPieChart 
                     title={
                       <>
                         <span className="truncate">Total Site per Provider</span>
                         <span className="font-mono text-sm xl:text-base font-extrabold ml-2">
                           {
                             providerMetrics.telkom + 
                             providerMetrics.xl + 
                             providerMetrics.icon + 
                             providerMetrics.telkomIcon + 
                             providerMetrics.telkomXl
                           }
                         </span>
                       </>
                     } 
                     items={[
                       { name: 'Telkom Only', value: providerMetrics.telkom, color: '#ef4444' }, 
                       { name: 'XLS Only', value: providerMetrics.xl, color: '#f59e0b' }, 
                       { name: 'Icon+ Only', value: providerMetrics.icon, color: '#2dd4bf' }, 
                       { name: 'Telkom-Icon+', value: providerMetrics.telkomIcon, color: '#38bdf8' }, 
                       { name: 'Telkom-XLS', value: providerMetrics.telkomXl, color: '#c084fc' }
                     ]} 
                     isGold 
                     isDarkMode={isDarkMode} 
                   />
                </div>
                <div className="w-[65%] flex flex-row gap-3 xl:gap-4 h-full">
                   <div className="flex-1 min-w-0"><DashCard title={<span className="flex flex-col leading-tight"><span>Single Link</span><span>Telkom Only</span></span>} value={providerMetrics.telkom} images={['./Telkom.png']} color="text-red-500" small onClick={() => setSelectedModal('telkom_only')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title={<span className="flex flex-col leading-tight"><span>Single Link</span><span>XLS Only</span></span>} value={providerMetrics.xl} images={['./XL.png']} color="text-amber-500" small onClick={() => setSelectedModal('xl_only')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title={<span className="flex flex-col leading-tight"><span>Single Link</span><span>Icon+ Only</span></span>} value={providerMetrics.icon} images={['./Icon.png']} color="text-teal-500" small onClick={() => setSelectedModal('icon_only')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title={<span className="flex flex-col leading-tight"><span>Dual Link</span><span>Telkom</span><span>& Icon+</span></span>} value={providerMetrics.telkomIcon} images={['./Telkom.png', './Icon.png']} color="text-sky-500" small onClick={() => setSelectedModal('telkom_icon')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title={<span className="flex flex-col leading-tight"><span>Dual Link</span><span>Telkom</span><span>& XLS</span></span>} value={providerMetrics.telkomXl} images={['./Telkom.png', './XL.png']} color="text-purple-500" small onClick={() => setSelectedModal('telkom_xl')} isDarkMode={isDarkMode} /></div>
                </div>
             </div>

             {/* BARIS 3 */}
             <div className="flex flex-row gap-4 xl:gap-5 h-full w-full">
                <div className="w-[35%] h-full">
                   <DashPieChart 
                     title={
                       <span className="flex justify-between items-center w-full">
                         <span>Total Sewa Link</span>
                         {/* PERBAIKAN: Kelas warna dihapus agar otomatis mewarisi warna GOLD dari parent */}
                         <span className="font-mono text-sm xl:text-base font-extrabold">
                           {
                             (providerMetrics.telkom + providerMetrics.telkomXl + providerMetrics.telkomIcon) + 
                             (providerMetrics.xl + providerMetrics.telkomXl) + 
                             (providerMetrics.icon + providerMetrics.telkomIcon)
                           }
                         </span>
                       </span>
                     } 
                     items={[
                       { name: 'Telkom', value: providerMetrics.telkom + providerMetrics.telkomXl + providerMetrics.telkomIcon, color: '#ef4444' }, 
                       { name: 'XLS', value: providerMetrics.xl + providerMetrics.telkomXl, color: '#f59e0b' }, 
                       { name: 'Icon+', value: providerMetrics.icon + providerMetrics.telkomIcon, color: '#2dd4bf' }
                     ]} 
                     isGold 
                     isDarkMode={isDarkMode} 
                   />
                </div>
                <div className="w-[65%] flex flex-row gap-4 xl:gap-5 h-full">
                   <div className="flex-1 min-w-0"><DashCard title="Total Link Telkom" value={providerMetrics.telkom + providerMetrics.telkomXl + providerMetrics.telkomIcon} images={['./Telkom.png']} color="text-red-500" onClick={() => setSelectedModal('total_telkom')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title="Total Link XLS" value={providerMetrics.xl + providerMetrics.telkomXl} images={['./XL.png']} color="text-amber-500" onClick={() => setSelectedModal('total_xl')} isDarkMode={isDarkMode} /></div>
                   <div className="flex-1 min-w-0"><DashCard title="Total Link Icon+" value={providerMetrics.icon + providerMetrics.telkomIcon} images={['./Icon.png']} color="text-teal-500" onClick={() => setSelectedModal('total_icon')} isDarkMode={isDarkMode} /></div>
                </div>
             </div>

             {/* BARIS 4: 80% Trend Chart & 20% Button Peta */}
             <div className="flex flex-row gap-4 xl:gap-5 h-full w-full">
                
                {/* TREND BULANAN (Sekarang menjadi 80% lebih lebar dan lega) */}
                <div className="w-[79.25%] h-full">
                   <TrendChart 
                     data={trendData} 
                     displayRange={displayRange} 
                     isGold 
                     isDarkMode={isDarkMode} 
                   />
                </div>
                
                {/* TOMBOL BUKA PETA (Tetap 20%) */}
                <div className="w-[20.75%] h-full">
                  <button 
                    onClick={() => setShowMap(true)} 
                    className="w-full h-full bg-emerald-600 hover:bg-emerald-500 text-white text-xl font-extrabold tracking-widest uppercase rounded-2xl transition-all shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:shadow-[0_0_60px_rgba(16,185,129,0.6)] group flex flex-col items-center justify-center gap-4 border border-emerald-400 relative z-20"
                  >
                      <span className="text-5xl group-hover:scale-125 transition-transform duration-500 drop-shadow-md">🗺️</span>
                      <span className="text-white drop-shadow-md">Map Mode</span>
                  </button>
                </div>
                
             </div>

          </div>
        </div>
      )}

      {/* ==========================================================
          LAYAR 2: UI KONTROL PETA (DIBUNGKUS SHOWMAP)
          ========================================================== */}
      {showMap && (
        <>
          {/* POPUP NO DATA */}
          {!hasData && rawData.length > 0 && (
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div className="bg-slate-900/95 px-10 py-8 rounded-2xl border border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.2)] flex flex-col items-center animate-pulse">
                <span className="text-5xl mb-4">📭</span>
                <h2 className="text-2xl font-bold tracking-widest text-red-400 uppercase drop-shadow-md">Tidak Ada Data</h2>
                <p className="text-slate-300 text-sm mt-2 font-mono">Periode {displayRange} belum tersedia.</p>
              </div>
            </div>
          )}

          {/* KIRI ATAS: HIGHLIGHT UTAMA & LEGENDA WARNA AV */}
          {/* PERBAIKAN: items-center diubah menjadi items-stretch agar tinggi dan posisinya sama persis */}
          <div className="absolute top-2 left-4 z-40 pointer-events-auto flex items-stretch gap-3">
            
            {/* CARD: AVG AVAILABILITY */}
            <div className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-md px-5 py-3 rounded-xl border border-sky-500/50 shadow-[0_0_25px_rgba(14,165,233,0.25)] flex flex-col justify-center border-l-4 border-l-sky-400 relative overflow-hidden group">
              <div className="absolute inset-0 bg-sky-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200/80 mb-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> RATA-RATA AVAILABILITY
              </span>
              <span className="text-2xl font-mono font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-300 leading-tight">
                {metrics.avgSLA.toFixed(2)}%
              </span>
            </div>

            {/* CARD: LEGENDA AV (Filter Interaktif Multiple Choice) */}
            <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 shadow-xl flex flex-col justify-center gap-0 h-full">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[8px] uppercase font-bold tracking-widest text-slate-400">Filter Nilai AV</span>
                {/* Tombol Reset Muncul Jika Ada yang Dimatikan */}
                {activeAvFilters.length < 4 && (
                  <button onClick={() => setActiveAvFilters(['green', 'yellow', 'red', 'black'])} className="text-[7px] bg-slate-800 px-1.5 py-0.5 rounded text-sky-400 hover:text-sky-300 transition-colors uppercase font-bold border border-slate-700">Reset</button>
                )}
              </div>
              
              <div className="flex items-center gap-3 xl:gap-4 mt-0.5">
                 {/* Hijau */}
                 <button 
                   onClick={() => setActiveAvFilters(prev => prev.includes('green') ? prev.filter(c => c !== 'green') : [...prev, 'green'])} 
                   className={`flex items-center gap-1.5 transition-all duration-300 hover:scale-105 ${!activeAvFilters.includes('green') ? 'opacity-30 grayscale' : 'opacity-100'}`}
                 >
                   <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/20 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></span>
                   <span className="text-[10px] xl:text-[11px] font-mono font-bold text-slate-200">≥ 90%</span>
                 </button>
                 
                 {/* Kuning */}
                 <button 
                   onClick={() => setActiveAvFilters(prev => prev.includes('yellow') ? prev.filter(c => c !== 'yellow') : [...prev, 'yellow'])} 
                   className={`flex items-center gap-1.5 transition-all duration-300 hover:scale-105 ${!activeAvFilters.includes('yellow') ? 'opacity-30 grayscale' : 'opacity-100'}`}
                 >
                   <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-white/20 shadow-[0_0_5px_rgba(250,204,21,0.5)]"></span>
                   <span className="text-[10px] xl:text-[11px] font-mono font-bold text-slate-200">50 - 89%</span>
                 </button>
                 
                 {/* Merah */}
                 <button 
                   onClick={() => setActiveAvFilters(prev => prev.includes('red') ? prev.filter(c => c !== 'red') : [...prev, 'red'])} 
                   className={`flex items-center gap-1.5 transition-all duration-300 hover:scale-105 ${!activeAvFilters.includes('red') ? 'opacity-30 grayscale' : 'opacity-100'}`}
                 >
                   <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white/20 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></span>
                   <span className="text-[10px] xl:text-[11px] font-mono font-bold text-slate-200">1 - 49%</span>
                 </button>
                 
                 {/* Hitam / 0% */}
                 <button 
                   onClick={() => setActiveAvFilters(prev => prev.includes('black') ? prev.filter(c => c !== 'black') : [...prev, 'black'])} 
                   className={`flex items-center gap-1.5 border-l border-slate-700/80 pl-2.5 transition-all duration-300 hover:scale-105 ${!activeAvFilters.includes('black') ? 'opacity-30 grayscale' : 'opacity-100'}`}
                 >
                   <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]"></span>
                   <span className="text-[10px] xl:text-[11px] font-mono font-bold text-slate-200">0%</span>
                 </button>
              </div>
            </div>

          </div>

          {/* KANAN ATAS: BASEMAP, NAVIGASI, JAM, & ZOOM GAUGE */}
          <div className="absolute top-4 right-4 z-40 pointer-events-none flex flex-col items-end gap-3 animate-in slide-in-from-right duration-500">
            
            {/* Kontainer Baris Atas: Switch Cluster, Basemap & Tombol Dashboard */}
            <div className="flex items-center gap-2 pointer-events-auto">
              
              {/* PETA CLUSTER SWITCH (Dipindah ke sini, di sebelah kiri Basemap) */}
              <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 shadow-xl flex items-center justify-center gap-2.5">
                <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 hidden sm:block">Peta Cluster</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[8px] font-bold tracking-widest ${!isClustered ? 'text-slate-300' : 'text-slate-600'}`}>OFF</span>
                  <button 
                    onClick={() => setIsClustered(!isClustered)}
                    className={`w-8 h-4 rounded-full relative transition-colors duration-300 focus:outline-none shadow-inner ${isClustered ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-[2px] left-[2px] bg-white w-3 h-3 rounded-full shadow transition-transform duration-300 ${isClustered ? 'transform translate-x-4' : ''}`} />
                  </button>
                  <span className={`text-[8px] font-bold tracking-widest ${isClustered ? 'text-emerald-400' : 'text-slate-600'}`}>ON</span>
                </div>
              </div>

              {/* BASEMAP SWITCHER (Dark/Light) */}
              <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl flex gap-1">
                <button onClick={() => setCurrentBasemap('dark')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition ${currentBasemap === 'dark' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-transparent text-slate-400 hover:text-white'}`}>Gelap</button>
                <button onClick={() => setCurrentBasemap('osm')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition ${currentBasemap === 'osm' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-transparent text-slate-400 hover:text-white'}`}>Terang</button>
              </div>

              {/* TOMBOL KEMBALI KE DASHBOARD */}
              <button 
                onClick={() => setShowMap(false)} 
                className="bg-orange-600/30 border border-orange-500/50 hover:bg-orange-500 hover:text-slate-950 text-white-400 p-1.5 px-4 rounded-xl text-xs font-bold tracking-wider transition-all shadow-xl h-full flex items-center gap-2"
                title="Kembali ke Dashboard Eksekutif"
              >
                <span className="text-sm">🏠</span> DASHBOARD
              </button>
            </div>

            {/* JAM REAL-TIME PETA */}
            <div className="pointer-events-auto">
               <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-800 shadow-xl flex flex-col items-end justify-center hidden sm:flex">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300">
                    {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })}
                  </span>
                  <span className="text-[12px] font-mono font-extrabold text-emerald-400 leading-tight drop-shadow-sm mt-0.5">
                    {currentTime.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':')} WIB
                  </span>
               </div>
            </div>

            {/* ZOOM GAUGE */}
            <div className="pointer-events-auto">
              <ZoomGauge 
                zoom={currentZoom} 
                selProv={selProv}
                selKab={selKab}
                selKec={selKec}
                selKel={selKel}
              />
            </div>
            
          </div>

          {/* TENGAH ATAS: JARKOMDAT MONITORING SYSTEM & PANEL FILTER */}
          <div className="absolute top-0 left-0 w-full z-20 flex flex-col items-center pointer-events-none">
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)} 
              className={`relative z-30 bg-slate-900/95 backdrop-blur-md px-5 py-3 border-x border-b border-emerald-500/40 shadow-[0_4px_20px_rgba(16,185,129,0.15)] pointer-events-auto flex items-center gap-4 transition-all hover:bg-slate-800 cursor-pointer group ${isFilterOpen ? 'rounded-b-none' : 'rounded-b-2xl'}`}
            >
              <img src="./kemendagri.svg" alt="Logo Kemendagri" className="h-10 w-10 object-contain flex-shrink-0 drop-shadow-md" />
              <h1 className="text-sm font-bold tracking-widest text-emerald-400 uppercase drop-shadow-md text-center select-none">SISTEM MONITORING JARKOMDAT</h1>
              <div className="bg-slate-800/80 w-6 h-6 flex items-center justify-center rounded text-xs text-slate-400 group-hover:text-emerald-400 transition font-mono flex-shrink-0">
                {isFilterOpen ? '✕' : '▼'}
              </div>
            </button>

            {/* PERBAIKAN 2: translate-y-0 diubah ke translate-y-4 agar panel turun memberi jarak (gap) dari tombol */}
            <div className={`relative z-20 pointer-events-auto transition-all duration-300 ease-out transform origin-top overflow-visible ${isFilterOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full absolute pointer-events-none'}`}>
              
              {/* PERBAIKAN 3: border dibuat keliling (border), sudut membulat semua (rounded-2xl), dan hapus efek nempel (-mt-[1px]) */}
              <div className="bg-slate-900/95 backdrop-blur-md p-3 px-6 rounded-2xl border border-emerald-500/40 shadow-[0_15px_40px_rgba(0,0,0,0.6)] flex flex-wrap justify-center items-center gap-3 text-xs">
                <input type="text" placeholder="Cari Kode/Nama Site..." className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 w-44 text-slate-200 focus:outline-none focus:border-emerald-500 transition shadow-inner text-xs font-semibold" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
                
                {/* FILTER TIPE KONEKSI */}
                <div className="relative">
                  <button type="button" onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-300 shadow-inner flex justify-between items-center w-48 text-left cursor-pointer hover:border-slate-600 transition text-xs font-semibold">
                    <span className="truncate pr-2">{selectedTypes.length === 0 ? 'Tipe Koneksi (All)' : `Tipe Koneksi (${selectedTypes.length} Terpilih)`}</span>
                    <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">{isTypeDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {isTypeDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] p-2 z-50 max-h-60 overflow-y-auto border-t-2 border-t-emerald-500 custom-scrollbar">
                      {uniqueTypes.map(t => {
                        const isChecked = selectedTypes.includes(t);
                        return (
                          <label key={t} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-850 rounded cursor-pointer select-none text-slate-300 transition-colors">
                            <input type="checkbox" checked={isChecked} onChange={() => setSelectedTypes(isChecked ? selectedTypes.filter(item => item !== t) : [...selectedTypes, t])} className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 cursor-pointer" />
                            <span className="text-xs font-semibold truncate" title={t}>{t}</span>
                          </label>
                        );
                      })}
                      {selectedTypes.length > 0 && (
                        <button type="button" onClick={() => setSelectedTypes([])} className="w-full text-center text-[10px] text-red-400 hover:text-red-300 font-bold border-t border-slate-800 pt-2 mt-1.5 cursor-pointer">✕ Bersihkan Pilihan</button>
                      )}
                    </div>
                  )}
                </div>

                {/* FILTER PROVIDER */}
                <div className="relative">
                  <button type="button" onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)} className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-300 shadow-inner flex justify-between items-center w-48 text-left cursor-pointer hover:border-slate-600 transition text-xs font-semibold">
                    <span className="truncate pr-2">{selectedProviders.length === 0 ? 'Provider (All)' : `Provider (${selectedProviders.length} Terpilih)`}</span>
                    <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">{isProviderDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {isProviderDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] p-2 z-50 max-h-60 overflow-y-auto border-t-2 border-t-emerald-500 custom-scrollbar">
                      {uniqueProviders.map(p => {
                        const isChecked = selectedProviders.includes(p);
                        return (
                          <label key={p} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-850 rounded cursor-pointer select-none text-slate-300 transition-colors">
                            <input type="checkbox" checked={isChecked} onChange={() => setSelectedProviders(isChecked ? selectedProviders.filter(item => item !== p) : [...selectedProviders, p])} className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 cursor-pointer" />
                            <span className="text-xs font-semibold truncate" title={p}>{p}</span>
                          </label>
                        );
                      })}
                      {selectedProviders.length > 0 && (
                        <button type="button" onClick={() => setSelectedProviders([])} className="w-full text-center text-[10px] text-red-400 hover:text-red-300 font-bold border-t border-slate-800 pt-2 mt-1.5 cursor-pointer">✕ Bersihkan Pilihan</button>
                      )}
                    </div>
                  )}
                </div>

                {/* FILTER BANDWIDTH */}
                <div className="relative">
                  <button type="button" onClick={() => setIsBandwidthDropdownOpen(!isBandwidthDropdownOpen)} className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-300 shadow-inner flex justify-between items-center w-48 text-left cursor-pointer hover:border-slate-600 transition text-xs font-semibold">
                    <span className="truncate pr-2">{selectedBandwidths.length === 0 ? 'Bandwidth (All)' : `Bandwidth (${selectedBandwidths.length} Terpilih)`}</span>
                    <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">{isBandwidthDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {isBandwidthDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] p-2 z-50 max-h-60 overflow-y-auto border-t-2 border-t-emerald-500 custom-scrollbar">
                      {uniqueBandwidths.map(bw => {
                        const isChecked = selectedBandwidths.includes(bw);
                        return (
                          <label key={bw} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-850 rounded cursor-pointer select-none text-slate-300 transition-colors">
                            <input type="checkbox" checked={isChecked} onChange={() => setSelectedBandwidths(isChecked ? selectedBandwidths.filter(item => item !== bw) : [...selectedBandwidths, bw])} className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 cursor-pointer" />
                            <span className="text-xs font-semibold truncate" title={bw}>{bw}</span>
                          </label>
                        );
                      })}
                      {selectedBandwidths.length > 0 && (
                        <button type="button" onClick={() => setSelectedBandwidths([])} className="w-full text-center text-[10px] text-red-400 hover:text-red-300 font-bold border-t border-slate-800 pt-2 mt-1.5 cursor-pointer">✕ Bersihkan Pilihan</button>
                      )}
                    </div>
                  )}
                </div>

                {/* FILTER STRUKTUR */}
                <div className="relative">
                  <button type="button" onClick={() => setIsStructureDropdownOpen(!isStructureDropdownOpen)} className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-300 shadow-inner flex justify-between items-center w-48 text-left cursor-pointer hover:border-slate-600 transition text-xs font-semibold">
                    <span className="truncate pr-2">{selectedStructures.length === 0 ? 'Struktur (All)' : `Struktur (${selectedStructures.length} Terpilih)`}</span>
                    <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">{isStructureDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {isStructureDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] p-2 z-50 max-h-60 overflow-y-auto border-t-2 border-t-emerald-500 custom-scrollbar">
                      {[
                         ...strukturOrder.filter(s => uniqueStructures.includes(s)).map(s => ({ value: s, label: strukturDisplay[s] })),
                         ...uniqueStructures.filter(s => !strukturOrder.includes(s) && s !== 'N/A' && s !== '').map(s => ({ value: s, label: s }))
                      ].map(opt => {
                        const isChecked = selectedStructures.includes(opt.value);
                        return (
                          <label key={opt.value} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-850 rounded cursor-pointer select-none text-slate-300 transition-colors">
                            <input type="checkbox" checked={isChecked} onChange={() => setSelectedStructures(isChecked ? selectedStructures.filter(item => item !== opt.value) : [...selectedStructures, opt.value])} className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 cursor-pointer" />
                            <span className="text-xs font-semibold truncate" title={opt.label}>{opt.label}</span>
                          </label>
                        );
                      })}
                      {selectedStructures.length > 0 && (
                        <button type="button" onClick={() => setSelectedStructures([])} className="w-full text-center text-[10px] text-red-400 hover:text-red-300 font-bold border-t border-slate-800 pt-2 mt-1.5 cursor-pointer">✕ Bersihkan Pilihan</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* LACI INFORMASI DETAIL */}
          <div className={`absolute top-[40%] -translate-y-1/2 left-0 z-30 flex items-center transition-transform duration-300 ease-in-out ${isDetailOpen ? 'translate-x-0' : '-translate-x-[22rem]'}`}>
            <div className="w-[22rem] bg-slate-900/95 backdrop-blur-md p-5 rounded-br-2xl border-y border-r border-emerald-500/40 shadow-[20px_0_30px_rgba(0,0,0,0.5)] h-fit max-h-[60vh] overflow-y-auto pointer-events-auto flex flex-col custom-scrollbar">
              <h2 className="text-base font-bold uppercase tracking-widest text-emerald-400 border-b border-slate-800 pb-2 mb-3 flex items-center gap-2 flex-shrink-0"><span className="text-base">📋</span> Panel Informasi Detail</h2>
              <div className="flex-1 overflow-y-auto pr-1">
                {clickedSite ? (
                  <div className="space-y-2.5 text-sm pb-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[11px] uppercase text-slate-500 block font-semibold">Nama Site</label><p className="text-base font-bold text-emerald-400 leading-tight truncate" title={clickedSite["NAMA SITE"] || clickedSite.text_site}>{clickedSite["NAMA SITE"] || clickedSite.text_site || '-'}</p></div>
                      <div><label className="text-[11px] uppercase text-slate-500 block font-semibold">Kode Site</label><p className="font-mono font-bold text-slate-200 text-base truncate">{clickedSite.kodesite || '-'}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-y border-slate-800/60 py-2.5 my-2 bg-slate-950/40 p-2 rounded">
                      {(() => {
                        // 1. Mencari nilai terbesar di antara semua AV yang tersedia di site tersebut
                        const v1 = parseSLA(clickedSite.AV_1);
                        const v2 = parseSLA(clickedSite.AV_2);
                        const vMain = parseSLA(clickedSite.AV);
                        const maxAV = Math.max(v1, v2, vMain);
                        
                        return (
                          <div>
                            {/* Label diubah sedikit agar memperjelas bahwa ini adalah nilai tertinggi (Max) */}
                            <label className="text-[11px] uppercase text-slate-500 block font-semibold">Availability</label>
                            
                            {/* 2. Menampilkan angka dan warna berdasarkan nilai terbesar */}
                            <p className={`font-mono font-bold text-xl mt-0.5 ${getAVColorClass(maxAV)}`}>
                              {(maxAV * 100).toFixed(2)}%
                            </p>
                          </div>
                        );
                      })()}
                      <div>
                        <label className="text-[11px] uppercase text-slate-500 block font-semibold">Struktur</label>
                        <p className="font-semibold text-slate-300 truncate mt-0.5">{renderField('struct', clickedSite.STRUKTUR)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[11px] uppercase text-slate-500 block">Provinsi</label><p className="text-slate-300 font-semibold truncate" title={renderField('prov', clickedSite.nama_prop || clickedSite.PROVINSI || clickedSite.provinsi)}>{renderField('prov', clickedSite.nama_prop || clickedSite.PROVINSI || clickedSite.provinsi)}</p></div>
                      <div><label className="text-[11px] uppercase text-slate-500 block">Kecamatan</label><p className="text-slate-300 font-semibold truncate" title={renderField('kec', clickedSite.nama_kec || clickedSite.KECAMATAN || clickedSite.kecamatan)}>{renderField('kec', clickedSite.nama_kec || clickedSite.KECAMATAN || clickedSite.kecamatan)}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[11px] uppercase text-slate-500 block">Kabupaten / Kota</label><p className="text-slate-300 font-semibold truncate" title={renderField('kab', clickedSite.nama_kab || clickedSite.KABUPATEN || clickedSite.kabupaten || clickedSite["KABUPATEN/KOTA"])}>{renderField('kab', clickedSite.nama_kab || clickedSite.KABUPATEN || clickedSite.kabupaten || clickedSite["KABUPATEN/KOTA"])}</p></div>
                      <div><label className="text-[11px] uppercase text-slate-500 block">Kelurahan / Desa</label><p className="text-slate-300 font-semibold truncate" title={renderField('kel', clickedSite.nama_kel || clickedSite.KELURAHAN || clickedSite.kelurahan || clickedSite.DESA)}>{renderField('kel', clickedSite.nama_kel || clickedSite.KELURAHAN || clickedSite.kelurahan || clickedSite.DESA)}</p></div>
                    </div>
                    {clickedSite.Provider_1 && clickedSite.Provider_1 !== '-' && clickedSite.Provider_1 !== 'nan' && (
                      <div className="pt-2.5 mt-1 border-t border-slate-800/80">
                        <div className={`text-[14px] font-bold mb-1 flex items-center gap-1.5 ${getProviderColor(clickedSite.Provider_1).text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${getProviderColor(clickedSite.Provider_1).bg}`}></span>{clickedSite.Provider_1.toUpperCase()}
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[11px] pl-2 border-l border-slate-800">
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">Koneksi</label><p className="text-slate-300 font-medium truncate">{clickedSite.type_koneksi_1 || '-'}</p></div>
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">Bandwidth</label><p className="text-slate-300 font-medium truncate">{clickedSite.bandwidth_1 || '-'}</p></div>
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">Status</label><p className={`font-semibold ${clickedSite.status_link_1 === 'AKTIF' ? 'text-emerald-400' : 'text-red-400'}`}>{clickedSite.status_link_1 || '-'}</p></div>
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">AV</label><p className={`font-mono font-bold ${getAVColorClass(clickedSite.AV_1)}`}>{clickedSite.AV_1 || '-'}</p></div>
                        </div>
                      </div>
                    )}
                    {clickedSite.Provider_2 && clickedSite.Provider_2 !== '-' && clickedSite.Provider_2 !== 'nan' && (
                      <div className="pt-2.5 mt-1 border-t border-slate-800/80">
                        <div className={`text-[14px] font-bold mb-1 flex items-center gap-1.5 ${getProviderColor(clickedSite.Provider_2).text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${getProviderColor(clickedSite.Provider_2).bg}`}></span>{clickedSite.Provider_2.toUpperCase()}
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[11px] pl-2 border-l border-slate-800">
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">Koneksi</label><p className="text-slate-300 font-medium truncate">{clickedSite.type_koneksi_2 || '-'}</p></div>
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">Bandwidth</label><p className="text-slate-300 font-medium truncate">{clickedSite.bandwidth_2 || '-'}</p></div>
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">Status</label><p className={`font-semibold ${clickedSite.status_link_2 === 'AKTIF' ? 'text-emerald-400' : 'text-red-400'}`}>{clickedSite.status_link_2 || '-'}</p></div>
                          <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 block">AV</label><p className={`font-mono font-bold ${getAVColorClass(clickedSite.AV_2)}`}>{clickedSite.AV_2 || '-'}</p></div>
                        </div>
                      </div>
                    )}
                    {clickedSite.AV_Rata_Rata && clickedSite.AV_Rata_Rata !== '-' && clickedSite.AV_Rata_Rata !== 'nan' && clickedSite.Provider_2 !== '-' && (
                      <div className="pt-2 mt-1 border-t border-slate-800/80">
                        <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 shadow-inner">
                          <span className="text-[14px] uppercase text-slate-400 font-bold tracking-wider">RATA-RATA AV</span>
                          <span className={`font-mono font-bold text-lg drop-shadow-md ${getAVColorClass(clickedSite.AV_Rata_Rata)}`}>{clickedSite.AV_Rata_Rata}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : clickedRegion ? (
                  <div className="space-y-3 text-xs">
                    <div className="bg-sky-500/10 border border-sky-500/20 p-2.5 rounded-lg mb-1"><p className="text-sky-400 italic">Data Wilayah Administrasi</p></div>
                    <div><label className="text-[10px] uppercase text-slate-500 block">Provinsi</label><p className="text-sm font-bold text-slate-200">{clickedRegion.nama_prop || '-'}</p></div>
                    <div><label className="text-[10px] uppercase text-slate-500 block">Kabupaten / Kota</label><p className="text-xs font-semibold text-slate-300">{clickedRegion.nama_kab || '-'}</p></div>
                    <div><label className="text-[10px] uppercase text-slate-500 block">Kecamatan</label><p className="text-xs font-semibold text-slate-300">{clickedRegion.nama_kec || '-'}</p></div>
                    <div><label className="text-[10px] uppercase text-slate-500 block">Kelurahan / Desa</label><p className="text-xs font-semibold text-slate-300">{clickedRegion.nama_kel || '-'}</p></div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-lg text-slate-500 my-auto"><span className="text-xl mb-1">👆</span><p className="text-[11px]">Klik titik site atau wilayah pada peta.</p></div>
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
          <div className={`absolute top-[47.5%] -translate-y-1/2 right-0 z-30 flex flex-row-reverse items-center transition-transform duration-300 ease-in-out ${isHierarchyOpen ? 'translate-x-0' : 'translate-x-[20rem]'}`}>
            <div className="w-[20rem] bg-slate-900/95 backdrop-blur-md p-5 rounded-bl-2xl border-y border-l border-emerald-500/40 shadow-[-20px_0_30px_rgba(0,0,0,0.5)] h-fit max-h-[55vh] pointer-events-auto flex flex-col">
              <h2 className="text-base font-bold uppercase tracking-widest text-emerald-400 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2"><span className="text-base">🎛️</span> Filter Hierarki</h2>
              <div className="space-y-3 flex-1 overflow-visible pr-1 pb-1">
                <div className="space-y-1.5"><label className="text-[12px] text-slate-500 uppercase font-medium block">Provinsi</label><CustomSelect value={selProv} onChange={(val) => handleHierarchyChange('prov', val)} options={listProvinsi} placeholder="-- Pilih Provinsi --" /></div>
                <div className="space-y-1.5 mt-2"><label className="text-[12px] text-slate-500 uppercase font-medium block">Kabupaten / Kota</label><CustomSelect value={selKab} onChange={(val) => handleHierarchyChange('kab', val)} options={listKabupaten} placeholder="-- Pilih Kabupaten --" disabled={!selProv} /></div>
                <div className="space-y-1.5 mt-2"><label className="text-[12px] text-slate-500 uppercase font-medium block">Kecamatan</label><CustomSelect value={selKec} onChange={(val) => handleHierarchyChange('kec', val)} options={listKecamatan} placeholder="-- Pilih Kecamatan --" disabled={!selKab} /></div>
                <div className="space-y-1.5 mt-2 mb-2"><label className="text-[12px] text-slate-500 uppercase font-medium block">Kelurahan / Desa</label><CustomSelect value={selKel} onChange={(val) => handleHierarchyChange('kel', val)} options={listKelurahan} placeholder="-- Pilih Kelurahan --" disabled={!selKec} /></div>
                <div className="mt-4 pt-4 border-t border-slate-800 pb-1"><p className="text-[10px] text-slate-500 italic text-center leading-relaxed">Pilih opsi di atas untuk auto-zoom ke poligon wilayah.</p></div>
              </div>
            </div>
            <button onClick={() => setIsHierarchyOpen(!isHierarchyOpen)} className="bg-slate-900/95 border-y border-l border-emerald-500/40 py-5 px-1.5 rounded-l-xl pointer-events-auto hover:bg-slate-800 transition shadow-[-5px_0_15px_rgba(16,185,129,0.15)] flex flex-col items-center justify-center gap-3 cursor-pointer group">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mb-1" />
              <span className="text-slate-300 group-hover:text-emerald-400 font-bold tracking-[0.2em] uppercase text-[10px] transition-colors" style={{ writingMode: 'vertical-rl' }}>Filter Hierarki</span>
              <span className="text-slate-500 text-[12px] font-mono mt-1">{isHierarchyOpen ? '▶' : '◀'}</span>
            </button>
          </div>

          {/* ==========================================================
              5 KARTU BAWAH (DIPENDEKKAN & POPUP RATA ATAS)
              ========================================================== */}
          <div className="absolute bottom-10 left-4 right-4 z-10 pointer-events-none">
            <div className="flex flex-row gap-3 xl:gap-4 pointer-events-auto h-[160px] xl:h-[180px] w-full items-stretch">
              
              {/* SISI KIRI (1/3 LAYAR) */}
              <div className="w-1/3 flex flex-col gap-2.5 h-full">
                <div className="flex gap-2.5 flex-1 min-h-0">
                  <div onClick={() => setSelectedModal('total')} className="flex-1 bg-slate-900/80 backdrop-blur-md p-3 rounded-xl border border-slate-800 shadow-xl cursor-pointer hover:border-blue-500/50 hover:bg-slate-900 transition flex flex-col justify-between group">
                    <div className="text-[11px] xl:text-[12px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-blue-400 transition leading-tight">1. Total Site</div>
                    <div className="flex flex-col mt-auto">
                      <span className="text-2xl xl:text-3xl font-bold font-mono text-white leading-none mb-1">{metrics.total}</span>
                      <span className="text-[9px] text-slate-500 group-hover:text-slate-300 font-medium">Tabel Lengkap ↗</span>
                    </div>
                  </div>
                  <div onClick={() => setSelectedModal('online')} className="flex-1 bg-slate-900/80 backdrop-blur-md p-3 rounded-xl border border-slate-800 shadow-xl cursor-pointer hover:border-emerald-500/50 hover:bg-slate-900 transition flex flex-col justify-between group">
                    <div className="text-[11px] xl:text-[12px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-emerald-400 transition leading-tight">2. Site Online</div>
                    <div className="flex flex-col mt-auto">
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-2xl xl:text-3xl font-bold font-mono text-emerald-400 leading-none">{metrics.online}</span>
                        <span className="text-[13px] xl:text-[14px] font-mono text-emerald-500/80 font-bold">({metrics.onlinePct}%)</span>
                      </div>
                      <span className="text-[9px] text-slate-500 group-hover:text-slate-300 font-medium">Tabel Lengkap ↗</span>
                    </div>
                  </div>
                  <div onClick={() => setSelectedModal('offline')} className="flex-1 bg-slate-900/80 backdrop-blur-md p-3 rounded-xl border border-slate-800 shadow-xl cursor-pointer hover:border-red-500/50 hover:bg-slate-900 transition flex flex-col justify-between group">
                    <div className="text-[11px] xl:text-[12px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-red-400 transition leading-tight">3. Site Offline</div>
                    <div className="flex flex-col mt-auto">
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-2xl xl:text-3xl font-bold font-mono text-red-400 leading-none">{metrics.offline}</span>
                        <span className="text-[13px] xl:text-[14px] font-mono text-red-500/80 font-bold">({metrics.offlinePct}%)</span>
                      </div>
                      <span className="text-[9px] text-slate-500 group-hover:text-slate-300 font-medium">Tabel Lengkap ↗</span>
                    </div>
                  </div>
                </div>

                <div className="h-[65px] bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 shadow-xl flex flex-col justify-between relative group">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[12px] xl:text-[13px] uppercase font-bold tracking-wider text-slate-400 leading-tight">5. Filter Waktu</div>
                    <CustomSelect value={selectedYear} onChange={setSelectedYear} options={uniqueYears} placeholder="Year" className="w-20" menuUp={true} />
                  </div>
                  <div className="flex flex-col w-full mt-auto">
                    <div className="relative h-1 bg-slate-800 rounded-lg w-full flex items-center">
                      <div className="absolute h-full bg-emerald-500 rounded-lg pointer-events-none transition-all duration-100" style={{ width: `${((selectedMonth - 1) / 11) * 100}%` }} />
                      <input type="range" min="1" max="12" value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))} disabled={uniqueYears.length === 0} className="absolute w-full h-full appearance-none bg-transparent cursor-pointer z-20 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none" />
                    </div>
                    <div className="flex justify-between text-[7px] text-slate-500 mt-1.5 font-mono px-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                        <span key={m} className={m === selectedMonth ? 'text-emerald-400 font-bold scale-125 transition-transform' : 'transition-transform'}>
                          {String(m).padStart(2, '0')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* SISI KANAN: CARD 4 DATA SUMMARY */}
              <div className={`transition-all duration-500 ease-in-out ${selectedPieData ? 'w-1/2' : 'w-2/3'} h-full bg-slate-900/80 backdrop-blur-md p-3 xl:p-4 rounded-xl border border-slate-800 shadow-xl flex flex-col relative`}>
                <div className="text-[14px] xl:text-[16px] uppercase font-bold tracking-wider text-slate-400 mb-1">4. Data Statistik</div>
                <div className="flex justify-center gap-2 xl:gap-4 items-start flex-1 w-full overflow-visible mt-1">
                  <DonutStat title="Tipe Koneksi" data={summaryData.tipe} onPieClick={setSelectedPieData} isActive={!selectedPieData || selectedPieData.title === 'Tipe Koneksi'} />
                  <DonutStat title="Provider" data={summaryData.provider} onPieClick={setSelectedPieData} isActive={!selectedPieData || selectedPieData.title === 'Provider'} />
                  <DonutStat title="Struktur" data={summaryData.struktur} onPieClick={setSelectedPieData} isActive={!selectedPieData || selectedPieData.title === 'Struktur'} />
                  <DonutStat title="Kapasitas Bandwidth" data={summaryData.bandwidth} onPieClick={setSelectedPieData} isActive={!selectedPieData || selectedPieData.title === 'Kapasitas Bandwidth'} />
                </div>
              </div>

              {/* POPUP CARD 4 (RATA ATAS & H-FIT & TANPA GAP) */}
              {selectedPieData && (
                <div className="w-1/6 h-fit max-h-full overflow-y-auto bg-slate-900/95 backdrop-blur-lg p-3 xl:p-4 rounded-xl border border-blue-500/30 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 self-start custom-scrollbar">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[11px] xl:text-[12px] font-bold text-blue-400 uppercase leading-tight pr-2">{selectedPieData.title}</h3>
                    <button onClick={() => setSelectedPieData(null)} className="bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded flex items-center justify-center transition-all shadow-[0_0_10px_rgba(239,68,68,0.4)] flex-shrink-0" title="Tutup Panel"><span className="text-[10px]">✕</span></button>
                  </div>
                  <div className="flex flex-col gap-0">
                    {selectedPieData.data.length > 0 ? (
                      selectedPieData.data.map((d, i) => {
                        const colors = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#a855f7'];
                        const color = colors[i % colors.length];
                        return (
                          <div key={d.name} className="flex justify-between items-center border-b border-slate-800/30 py-[0px] gap-1 hover:bg-slate-800/30 transition-colors">
                            <div className="flex items-center gap-1 min-w-0">
                              <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-[11px] xl:text-[12px] font-bold truncate" style={{ color }} title={d.name}>{d.name}</span>
                            </div>
                            <span className="text-[12px] font-mono font-bold flex-shrink-0 text-slate-200">
                              {d.count} <span style={{ color }} className="font-medium text-[12px] opacity-80">({d.pct}%)</span>
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center py-2"><span className="text-[9px] font-bold text-red-400 uppercase">NO DATA</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {/* MODAL POPUP (RAW DATA TABLE) */}
          {selectedModal && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 pointer-events-auto">
              <div className="bg-slate-900 w-full max-w-6xl h-[80vh] rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    {/* Gunakan replace untuk membuang underscore pada judul */}
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Tabel Data — Site {selectedModal.toUpperCase().replace('_', ' ')}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">Data Ditemukan: {modalTableData.length} Baris</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleExportExcel} className="bg-emerald-600/20 border border-emerald-500/50 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 font-semibold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-2"><span>⬇</span> Unduh Excel</button>
                    <button onClick={() => setSelectedModal(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs transition font-semibold">✕ Tutup Tabel</button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800 sticky top-0 z-10">
                        <th className="p-3">Kode Site</th><th className="p-3">Nama Site</th><th className="p-3">Provinsi</th><th className="p-3">Kabupaten</th><th className="p-3">Koneksi</th><th className="p-3">Provider</th><th className="p-3">Struktur</th><th className="p-3">Bandwidth</th><th className="p-3">SLA (AV)</th><th className="p-3">Status</th>
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
                            <td className="p-3 text-slate-400">{normalizeTipeKoneksi(p.type_koneksi)}</td>
                            <td className="p-3 text-slate-300">{p.Provider || '-'}</td>
                            <td className="p-3 text-slate-300">{p.STRUKTUR || '-'}</td>
                            <td className="p-3 text-slate-300">{p.bandwidth || '-'}</td>
                            <td className="p-3 font-mono text-amber-400">{(parseSLA(p.AV) * 100).toFixed(2)}%</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status_link === 'AKTIF' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{p.status_link || 'UNKNOWN'}</span>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan="10" className="p-8 text-center text-slate-500 italic">Tidak Ada Data Yang Cocok.</td></tr>
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
