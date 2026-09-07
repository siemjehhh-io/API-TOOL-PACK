import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Zap, QrCode, Layers, ShieldCheck, ArrowRight, MousePointerClick } from "lucide-react";

interface ClickParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
}

interface InteractiveHeroProps {
  onSelectService: (section: string | null, category?: string) => void;
}

const SERVICE_SHORTCUTS = [
  {
    id: "giga",
    label: "GIGA PANEL",
    sub: "Data Extraction & Parse",
    icon: Layers,
    section: "formula",
    category: "giga",
    color: "bg-[#74A355]",
    depth: 1.2,
  },
  {
    id: "qris-hoki",
    label: "QRIS HOKI",
    sub: "WD & DP Hoki Formatter",
    icon: QrCode,
    section: "formula",
    category: "qris-hoki",
    color: "bg-[#3A592B]",
    depth: 1.5,
  },
  {
    id: "ozzo",
    label: "OZZO TOOLS",
    sub: "WD QRIS Ajaib Ozzo",
    icon: Zap,
    section: "formula",
    category: "ozzo",
    color: "bg-[#D9B038]",
    depth: 1.1,
  },
  {
    id: "mutasi",
    label: "SMART MUTASI",
    sub: "BCA Bank Mutation Parser",
    icon: Sparkles,
    section: "mutasi",
    category: undefined,
    color: "bg-[#567C3E]",
    depth: 1.4,
  },
  {
    id: "phishing",
    label: "PHISH SHIELD",
    sub: "Domain Security Check",
    icon: ShieldCheck,
    section: "phishing",
    category: undefined,
    color: "bg-[#23321B]",
    depth: 1.3,
  },
];

export const InteractiveHero: React.FC<InteractiveHeroProps> = ({ onSelectService }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, rawX: 0.5, rawY: 0.5 });
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<ClickParticle[]>([]);
  const [greetingText, setGreetingText] = useState("Halo! 👋");
  const [isGreetingClicked, setIsGreetingClicked] = useState(false);

  // Mouse movement tracking for 3D Parallax Tilt
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0 to 1
    const y = (e.clientY - rect.top) / rect.height; // 0 to 1

    // Normalized from -1 to 1 for tilt calculation
    const normX = (x - 0.5) * 2;
    const normY = (y - 0.5) * 2;

    setMousePos({
      x: normX,
      y: normY,
      rawX: x,
      rawY: y,
    });
  }, []);

  // Handle canvas click particle burst effect
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const colors = ["#74A355", "#D9B038", "#82B660", "#60A5FA", "#F59E0B"];
    const newParticles: ClickParticle[] = Array.from({ length: 6 }).map((_, i) => ({
      id: Date.now() + i + Math.random(),
      x: clickX + (Math.random() - 0.5) * 40,
      y: clickY + (Math.random() - 0.5) * 40,
      size: Math.random() * 12 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    setParticles((prev) => [...prev.slice(-18), ...newParticles]);
  }, []);

  // Toggle greeting text on click
  const handleGreetingClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGreetingClicked(true);
    const greetings = [
      "Halo! 👋",
      "Selamat Datang! 🌿",
      "Siap Ekstraksi Data! ⚡",
      "Pilih Modul Layanan! 🚀",
      "API GROUP TOOLS v2.0 🎯",
    ];
    const nextIdx = (greetings.indexOf(greetingText) + 1) % greetings.length;
    setGreetingText(greetings[nextIdx]);

    setTimeout(() => setIsGreetingClicked(false), 500);
  };

  const tiltX = mousePos.y * -8; // Pitch
  const tiltY = mousePos.x * 8;  // Yaw

  return (
    <div className="w-full relative py-2">
      <motion.div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setMousePos({ x: 0, y: 0, rawX: 0.5, rawY: 0.5 });
        }}
        onClick={handleCanvasClick}
        style={{
          perspective: 1200,
        }}
        className="relative w-full rounded-[2.5rem] overflow-hidden neu-card border-2 border-[#D5C988] shadow-2xl shadow-[#4A4215]/20 cursor-crosshair min-h-[440px] flex flex-col justify-between p-6 sm:p-8 select-none transition-all duration-300"
      >
        {/* ── 1. PARALLAX LANDSCAPE BACKGROUND LAYER ── */}
        <motion.div
          animate={{
            rotateX: isHovered ? tiltX : 0,
            rotateY: isHovered ? tiltY : 0,
            scale: isHovered ? 1.03 : 1,
          }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none"
          style={{
            backgroundImage: `url('/hero-landscape.png')`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Subtle Color Overlay for Harmony */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#FDFBD4]/60 via-transparent to-[#FDFBD4]/30 backdrop-brightness-[1.02]" />
        </motion.div>

        {/* ── 2. CLICK PARTICLES & RIPPLES LAYER ── */}
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, scale: 0.2, x: p.x, y: p.y }}
              animate={{
                opacity: 0,
                scale: 1.8,
                y: p.y - 60 - Math.random() * 40,
                x: p.x + (Math.random() - 0.5) * 50,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
              className="absolute z-20 pointer-events-none rounded-full shadow-lg"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                boxShadow: `0 0 12px ${p.color}`,
              }}
            />
          ))}
        </AnimatePresence>

        {/* ── 3. HERO TOP HEADER BAR & INTERACTIVE GREETING ── */}
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: 15, scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-10 h-10 rounded-2xl bg-[#74A355] text-white flex items-center justify-center shadow-md clay-badge cursor-pointer"
              onClick={() => onSelectService(null)}
            >
              <Sparkles size={20} />
            </motion.div>
            <div>
              <h2 className="text-xl sm:text-2xl font-thertole tracking-wider text-[#23321B] drop-shadow-sm">
                PORTAL LAYANAN EKSKLUSIF
              </h2>
              <p className="text-xs font-bold text-[#596B4F] flex items-center gap-1.5">
                <MousePointerClick size={13} className="animate-bounce text-[#74A355]" />
                Gerakkan kursor & klik di mana saja untuk interaksi!
              </p>
            </div>
          </div>

          {/* Interactive Floating Speech Bubble "Halo!" */}
          <motion.div
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 1.3 }}
            animate={{
              y: [0, -6, 0],
            }}
            transition={{
              y: { repeat: Infinity, duration: 2.5, ease: "easeInOut" },
              scale: { type: "spring", stiffness: 300, damping: 15 },
            }}
            onClick={handleGreetingClick}
            className="bg-[#3A592B] px-5 py-2.5 rounded-full border-2 border-[#82B660] shadow-xl cursor-pointer flex items-center gap-2.5 group transition-all"
          >
            <span className="text-sm sm:text-base font-black text-[#FFFFFF] drop-shadow-sm">
              {greetingText}
            </span>
            <span className="text-[10px] font-black text-[#23321B] uppercase tracking-wider bg-[#82B660] px-2.5 py-1 rounded-full shadow-sm shrink-0">
              KLIK SAYA!
            </span>
          </motion.div>
        </div>

        {/* ── 4. CENTER DECORATIVE ORB / INTERACTIVE GLOW ── */}
        <div className="relative z-10 my-auto py-6 flex flex-col items-center justify-center text-center">
          <motion.div
            style={{
              x: mousePos.x * 15,
              y: mousePos.y * 15,
            }}
            className="relative"
          >
            {/* Center Pulsing Badge */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#3A592B] text-white backdrop-blur-md border border-[#82B660] shadow-md mb-3"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#82B660] animate-ping" />
              <span className="text-xs font-bold text-white">INTELLIGENT DATA EXTRACTOR HUB</span>
            </motion.div>

            <h1 className="text-2xl sm:text-4xl font-thertole text-[#23321B] tracking-wider max-w-xl leading-tight">
              PILIH MODUL UNTUK MEMULAI
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-[#596B4F] mt-2 max-w-md mx-auto">
              Klik pada salah satu kartu layanan interaktif di bawah untuk membuka modul ekstraksi data pilihan Anda.
            </p>
          </motion.div>
        </div>

        {/* ── 5. INTERACTIVE 3D FLOATING SERVICE SHORTCUT CARDS ── */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
          {SERVICE_SHORTCUTS.map((item) => {
            const Icon = item.icon;
            // Calculate individual parallax offset based on item depth
            const offsetX = mousePos.x * 12 * item.depth;
            const offsetY = mousePos.y * 12 * item.depth;

            return (
              <motion.div
                key={item.id}
                style={{
                  x: offsetX,
                  y: offsetY,
                }}
                whileHover={{
                  scale: 1.08,
                  y: -6,
                  transition: { type: "spring", stiffness: 300, damping: 15 },
                }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectService(item.section, item.category);
                }}
                className="clay-card bg-[#FDFBD4]/95 backdrop-blur-md p-3.5 rounded-2xl border-2 border-[#D5C988] shadow-lg hover:shadow-2xl hover:scale-105 hover:-translate-y-1 cursor-pointer flex flex-col justify-between gap-3 group transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-xl ${item.color} text-white flex items-center justify-center shadow-md clay-badge group-hover:scale-110 transition-transform`}>
                    <Icon size={18} />
                  </div>
                  <ArrowRight size={14} className="text-[#596B4F] group-hover:text-[#74A355] group-hover:translate-x-1 transition-all" />
                </div>

                <div>
                  <h3 className="text-xs font-bold text-[#23321B] group-hover:text-[#74A355] transition-colors leading-tight">
                    {item.label}
                  </h3>
                  <p className="text-[10px] font-medium text-[#596B4F] mt-0.5 truncate">
                    {item.sub}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
