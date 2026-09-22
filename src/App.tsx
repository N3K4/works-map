import { useState, useRef, useEffect, useCallback } from 'react';

interface Point { x: number; y: number; }

interface Zone {
  id: string;
  points: Point[];
  category: string;
  label: string;
  visible: boolean;
  groupId: string | null;
}

interface Group {
  id: string;
  name: string;
  zoneIds: string[];
  pdfUrl: string;
  tableUrl: string;
  notes: string;
}

interface ImageData {
  id: string;
  name: string;
  src: string;
  img: HTMLImageElement;
  canvasSize: { width: number; height: number };
  zones: Zone[];
  groups: Group[];
}

interface Category {
  id: string;
  name: string;
  color: string;
}

const CATEGORIES: Category[] = [
  { id: 'floor', name: 'Пол', color: '#8B5CF6' },
  { id: 'ceiling', name: 'Потолок', color: '#06B6D4' },
  { id: 'walls', name: 'Стены', color: '#F59E0B' },
  { id: 'partitions', name: 'Перегородки', color: '#10B981' },
  { id: 'engineering', name: 'Инж. системы', color: '#EF4444' },
];

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

type Tab = 'canvas' | 'docs';

function App() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('floor');
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [mode, setMode] = useState<'draw' | 'select'>('draw');
  const [tab, setTab] = useState<Tab>('canvas');
  const [editingImageName, setEditingImageName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [renamingZoneId, setRenamingZoneId] = useState<string | null>(null);
  const [renameZoneValue, setRenameZoneValue] = useState('');
  const [highlightZoneId, setHighlightZoneId] = useState<string | null>(null);
  const [highlightUntil, setHighlightUntil] = useState<number>(0);
  const [exportModal, setExportModal] = useState<{ content: string; filename: string; type: string } | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragDistance, setDragDistance] = useState(0);
  const mouseDownPos = useRef<Point>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const activeImage = images.find(img => img.id === activeImageId) || null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const id = Date.now().toString() + Math.random().toString(36).slice(2);
          const name = file.name.replace(/\.[^/.]+$/, '');
          const newImage: ImageData = {
            id, name, src, img,
            canvasSize: { width: img.width, height: img.height },
            zones: [], groups: [],
          };
          setImages(prev => [...prev, newImage]);
          setActiveImageId(id);
          setCurrentPoints([]);
          setSelectedZone(null);
          setTimeout(() => fitToScreen(img.width, img.height), 50);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fitToScreen = useCallback((imgWidth?: number, imgHeight?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const w = imgWidth ?? activeImage?.img.width ?? 0;
    const h = imgHeight ?? activeImage?.img.height ?? 0;
    if (!w || !h) return;
    const padding = 40;
    const vw = viewport.clientWidth - padding * 2;
    const vh = viewport.clientHeight - padding * 2;
    const newZoom = Math.min(vw / w, vh / h, 1);
    setZoom(newZoom);
    setPan({ x: (vw - w * newZoom) / 2, y: (vh - h * newZoom) / 2 });
  }, [activeImage]);

  const switchImage = (id: string) => {
    setActiveImageId(id);
    setCurrentPoints([]);
    setSelectedZone(null);
    const img = images.find(i => i.id === id);
    if (img) setTimeout(() => fitToScreen(img.img.width, img.img.height), 30);
  };

  const getCanvasCoords = (e: React.MouseEvent): Point => {
    const viewport = viewportRef.current;
    if (!viewport || !activeImage) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  const zoomRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  zoomRef.current = { zoom, pan };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      if (!activeImage) return;
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { zoom: cz, pan: cp } = zoomRef.current;
      const canvasX = (mouseX - cp.x) / cz;
      const canvasY = (mouseY - cp.y) / cz;
      const delta = -e.deltaY * 0.001;
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cz * (1 + delta)));
      setZoom(nz);
      setPan({ x: mouseX - canvasX * nz, y: mouseY - canvasY * nz });
    };
    viewport.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheelEvent);
  }, [activeImage]);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    setDragDistance(0);
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - mouseDownPos.current.x;
    const dy = e.clientY - mouseDownPos.current.y;
    setDragDistance(Math.sqrt(dx * dx + dy * dy));
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (!activeImage) return;
    setMousePos(getCanvasCoords(e));
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!activeImage) return;
    if (isPanning || spaceHeld || dragDistance > 5) return;
    const point = getCanvasCoords(e);

    if (mode === 'select') {
      for (let i = activeImage.zones.length - 1; i >= 0; i--) {
        const z = activeImage.zones[i];
        if (z.visible && isPointInPolygon(point, z.points)) {
          setSelectedZone(z.id);
          return;
        }
      }
      setSelectedZone(null);
      return;
    }

    if (currentPoints.length >= 3) {
      const firstPoint = currentPoints[0];
      const distance = Math.sqrt(
        Math.pow(point.x - firstPoint.x, 2) + Math.pow(point.y - firstPoint.y, 2)
      );
      if (distance < 15 / zoom) {
        const newZone: Zone = {
          id: Date.now().toString(),
          points: [...currentPoints],
          category: activeCategory,
          label: `${CATEGORIES.find(c => c.id === activeCategory)?.name} ${activeImage.zones.filter(z => z.category === activeCategory).length + 1}`,
          visible: true,
          groupId: null,
        };
        updateImage({ zones: [...activeImage.zones, newZone] });
        setCurrentPoints([]);
        return;
      }
    }
    setCurrentPoints([...currentPoints, point]);
  };

  const updateImage = (patch: Partial<ImageData>) => {
    setImages(prev => prev.map(img =>
      img.id === activeImageId ? { ...img, ...patch } : img
    ));
  };

  const updateZone = (zoneId: string, patch: Partial<Zone>) => {
    if (!activeImage) return;
    updateImage({
      zones: activeImage.zones.map(z => z.id === zoneId ? { ...z, ...patch } : z),
    });
  };

  const deleteZone = (zoneId: string) => {
    if (!activeImage) return;
    const zone = activeImage.zones.find(z => z.id === zoneId);
    updateImage({
      zones: activeImage.zones.filter(z => z.id !== zoneId),
      groups: zone?.groupId
        ? activeImage.groups.map(g =>
            g.id === zone.groupId
              ? { ...g, zoneIds: g.zoneIds.filter(id => id !== zoneId) }
              : g
          )
        : activeImage.groups,
    });
    if (selectedZone === zoneId) setSelectedZone(null);
  };

  const createGroup = () => {
    if (!activeImage) return;
    const newGroup: Group = {
      id: Date.now().toString(),
      name: `Группа ${activeImage.groups.length + 1}`,
      zoneIds: [],
      pdfUrl: '',
      tableUrl: '',
      notes: '',
    };
    updateImage({ groups: [...activeImage.groups, newGroup] });
    setEditingGroup(newGroup);
    setShowGroupModal(true);
  };

  const updateGroup = (groupId: string, patch: Partial<Group>) => {
    if (!activeImage) return;
    updateImage({
      groups: activeImage.groups.map(g => g.id === groupId ? { ...g, ...patch } : g),
    });
  };

  const deleteGroup = (groupId: string) => {
    if (!activeImage) return;
    updateImage({
      groups: activeImage.groups.filter(g => g.id !== groupId),
      zones: activeImage.zones.map(z =>
        z.groupId === groupId ? { ...z, groupId: null } : z
      ),
    });
    if (selectedGroup === groupId) setSelectedGroup(null);
  };

  const toggleZoneInGroup = (groupId: string, zoneId: string) => {
    if (!activeImage) return;
    const group = activeImage.groups.find(g => g.id === groupId);
    if (!group) return;
    const isIn = group.zoneIds.includes(zoneId);
    const newZoneIds = isIn
      ? group.zoneIds.filter(id => id !== zoneId)
      : [...group.zoneIds, zoneId];
    updateGroup(groupId, { zoneIds: newZoneIds });
    updateImage({
      zones: activeImage.zones.map(z =>
        z.id === zoneId ? { ...z, groupId: isIn ? null : groupId } : z
      ),
    });
  };

  const goToZone = (zoneId: string) => {
    setTab('canvas');
    setMode('select');
    setSelectedZone(zoneId);
    setHighlightZoneId(zoneId);
    setHighlightUntil(Date.now() + 3000);
  };

  const goToGroup = (groupId: string) => {
    if (!activeImage) return;
    const group = activeImage.groups.find(g => g.id === groupId);
    if (!group || group.zoneIds.length === 0) return;
    setTab('canvas');
    setMode('select');
    setSelectedGroup(groupId);
    setHighlightZoneId(groupId);
    setHighlightUntil(Date.now() + 3000);
  };

  useEffect(() => {
    if (!highlightZoneId) return;
    const timer = setTimeout(() => {
      setHighlightZoneId(null);
      setSelectedGroup(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [highlightZoneId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingImageName || renamingZoneId || showGroupModal) return;
      if (e.key === ' ') { e.preventDefault(); setSpaceHeld(true); }
      if (e.key === 'Escape') {
        if (currentPoints.length > 0) setCurrentPoints([]);
        else { setSelectedZone(null); setSelectedGroup(null); }
      }
      if (e.key === 'Delete' && selectedZone && activeImage) {
        deleteZone(selectedZone);
      }
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && tab === 'canvas') {
        setMode('select'); setCurrentPoints([]);
      }
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && tab === 'canvas') {
        setMode('draw');
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 5 && tab === 'canvas') {
        setActiveCategory(CATEGORIES[num - 1].id);
        setMode('draw');
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (activeImage) fitToScreen(activeImage.img.width, activeImage.img.height);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') { setSpaceHeld(false); setIsPanning(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedZone, activeImage, currentPoints, editingImageName, renamingZoneId, showGroupModal, tab, fitToScreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = activeImage.canvasSize.width;
    canvas.height = activeImage.canvasSize.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(activeImage.img, 0, 0, canvas.width, canvas.height);

    const now = Date.now();
    const isHighlighting = highlightUntil > now;
    const pulse = isHighlighting ? 0.5 + 0.5 * Math.sin(now / 150) : 0;

    activeImage.zones.forEach((zone) => {
      if (!zone.visible) return;
      const category = CATEGORIES.find(c => c.id === zone.category);
      if (!category) return;

      const isZoneSelected = zone.id === selectedZone;
      const isGroupSelected = zone.groupId === selectedGroup;
      const isHighlighted = isHighlighting && (
        zone.id === highlightZoneId ||
        (activeImage.groups.find(g => g.id === highlightZoneId)?.zoneIds.includes(zone.id))
      );

      ctx.beginPath();
      ctx.moveTo(zone.points[0].x, zone.points[0].y);
      for (let i = 1; i < zone.points.length; i++) {
        ctx.lineTo(zone.points[i].x, zone.points[i].y);
      }
      ctx.closePath();

      let fillAlpha = '25';
      if (isZoneSelected || isGroupSelected) fillAlpha = '55';
      if (isHighlighted) fillAlpha = '80';

      ctx.fillStyle = category.color + fillAlpha;
      ctx.fill();

      ctx.strokeStyle = category.color;
      ctx.lineWidth = ((isZoneSelected || isGroupSelected || isHighlighted) ? 3 : 1.5) / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      const centerX = zone.points.reduce((s, p) => s + p.x, 0) / zone.points.length;
      const centerY = zone.points.reduce((s, p) => s + p.y, 0) / zone.points.length;
      const fontSize = Math.max(10, 12 / zoom);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3 / zoom;
      ctx.strokeText(zone.label, centerX, centerY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(zone.label, centerX, centerY);

      if (isHighlighted) {
        ctx.beginPath();
        ctx.moveTo(zone.points[0].x, zone.points[0].y);
        for (let i = 1; i < zone.points.length; i++) {
          ctx.lineTo(zone.points[i].x, zone.points[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(255, 255, 0, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = (4 + pulse * 2) / zoom;
        ctx.setLineDash([8 / zoom, 4 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    if (currentPoints.length > 0 && mode === 'draw') {
      const category = CATEGORIES.find(c => c.id === activeCategory);
      if (!category) return;

      if (currentPoints.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        if (mousePos) ctx.lineTo(mousePos.x, mousePos.y);
        ctx.closePath();
        ctx.fillStyle = category.color + '15';
        ctx.fill();
      }

      if (currentPoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.strokeStyle = category.color;
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      }

      if (mousePos && currentPoints.length >= 1) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[currentPoints.length - 1].x, currentPoints[currentPoints.length - 1].y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = category.color;
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      currentPoints.forEach((point, index) => {
        const isFirst = index === 0 && currentPoints.length >= 3;
        const radius = (isFirst ? 8 : 5) / zoom;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isFirst ? '#ffffff' : category.color;
        ctx.fill();
        ctx.strokeStyle = isFirst ? category.color : '#ffffff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      });
    }

    if (isHighlighting) {
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) canvas.dispatchEvent(new Event('redraw'));
      });
    }
  }, [activeImage, currentPoints, mousePos, activeCategory, selectedZone, selectedGroup, mode, zoom, highlightZoneId, highlightUntil]);

  useEffect(() => {
    if (!highlightZoneId) return;
    let raf: number;
    const loop = () => {
      if (Date.now() < highlightUntil) {
        const canvas = canvasRef.current;
        if (canvas && activeImage) {
          canvas.dispatchEvent(new Event('redraw'));
        }
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [highlightZoneId, highlightUntil, activeImage]);

  const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const clearAllZones = () => {
    if (!activeImage) return;
    if (window.confirm('Удалить все области на этом изображении?')) {
      updateImage({ zones: [], groups: [] });
      setCurrentPoints([]);
      setSelectedZone(null);
    }
  };

  const exportData = () => {
    const data = {
      images: images.map(img => ({
        name: img.name,
        zones: img.zones.map(z => ({
          label: z.label, categoryId: z.category,
          categoryName: CATEGORIES.find(c => c.id === z.category)?.name,
          visible: z.visible, groupId: z.groupId, points: z.points,
        })),
        groups: img.groups,
      })),
    };
    const content = JSON.stringify(data, null, 2);
    setExportModal({
      content,
      filename: 'zones-export.json', type: 'zones',
    });
  };

  const exportProject = () => {
    const projectData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      activeImageId,
      images: images.map(img => ({
        id: img.id, name: img.name, src: img.src,
        width: img.canvasSize.width, height: img.canvasSize.height,
        zones: img.zones, groups: img.groups,
      })),
    };
    const date = new Date().toISOString().slice(0, 10);
    const content = JSON.stringify(projectData);
    setExportModal({
      content,
      filename: `project-${date}.zoneproj`, type: 'project',
    });
  };

  const downloadFromModal = () => {
    if (!exportModal) return;
    const blob = new Blob([exportModal.content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = exportModal.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openInNewTab = () => {
    if (!exportModal) return;
    const blob = new Blob([exportModal.content], { type: 'application/json' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const copyToClipboard = async () => {
    if (!exportModal) return;
    try {
      await navigator.clipboard.writeText(exportModal.content);
      alert('Скопировано!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = exportModal.content;
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Скопировано!');
    }
  };

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.images || !Array.isArray(data.images)) {
          alert('Неверный формат'); return;
        }
        Promise.all(data.images.map((imgData: any) => new Promise<ImageData>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({
            id: imgData.id || Date.now().toString() + Math.random().toString(36).slice(2),
            name: imgData.name || 'Без имени',
            src: imgData.src, img,
            canvasSize: { width: imgData.width || img.width, height: imgData.height || img.height },
            zones: (imgData.zones || []).map((z: any) => ({
              id: z.id || Date.now().toString() + Math.random().toString(36).slice(2),
              label: z.label || 'Область',
              category: z.category || 'floor',
              points: z.points || [],
              visible: z.visible !== false,
              groupId: z.groupId || null,
            })),
            groups: (imgData.groups || []).map((g: any) => ({
              id: g.id || Date.now().toString() + Math.random().toString(36).slice(2),
              name: g.name || 'Группа',
              zoneIds: g.zoneIds || [],
              pdfUrl: g.pdfUrl || '',
              tableUrl: g.tableUrl || '',
              notes: g.notes || '',
            })),
          });
          img.onerror = () => reject(new Error(`Ошибка: ${imgData.name}`));
          img.src = imgData.src;
        }))).then(loadedImages => {
          setImages(loadedImages);
          if (data.activeImageId && loadedImages.find(i => i.id === data.activeImageId)) {
            setActiveImageId(data.activeImageId);
          } else if (loadedImages.length > 0) {
            setActiveImageId(loadedImages[0].id);
          }
          setCurrentPoints([]);
          setSelectedZone(null);
          setTimeout(() => {
            const activeImg = loadedImages.find(i => i.id === (data.activeImageId || loadedImages[0]?.id));
            if (activeImg) fitToScreen(activeImg.img.width, activeImg.img.height);
          }, 100);
          alert(`Загружено: ${loadedImages.length} изобр., ${loadedImages.reduce((s, i) => s + i.zones.length, 0)} обл., ${loadedImages.reduce((s, i) => s + i.groups.length, 0)} групп`);
        }).catch(err => alert(`Ошибка: ${err.message}`));
      } catch { alert('Ошибка чтения'); }
    };
    reader.readAsText(file);
    if (projectInputRef.current) projectInputRef.current.value = '';
  };

  const deleteImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    if (activeImageId === id) {
      const remaining = images.filter(img => img.id !== id);
      setActiveImageId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const startRename = (id: string, currentName: string) => {
    setEditingImageName(id); setTempName(currentName);
  };

  const confirmRename = () => {
    if (editingImageName && tempName.trim()) {
      setImages(prev => prev.map(img =>
        img.id === editingImageName ? { ...img, name: tempName.trim() } : img
      ));
    }
    setEditingImageName(null); setTempName('');
  };

  const startRenameZone = (zoneId: string, currentLabel: string) => {
    setRenamingZoneId(zoneId);
    setRenameZoneValue(currentLabel);
  };

  const confirmRenameZone = () => {
    if (renamingZoneId && renameZoneValue.trim()) {
      updateZone(renamingZoneId, { label: renameZoneValue.trim() });
    }
    setRenamingZoneId(null); setRenameZoneValue('');
  };

  const zoomIn = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const canvasX = (cx - pan.x) / zoom, canvasY = (cy - pan.y) / zoom;
    const nz = Math.min(MAX_ZOOM, zoom * 1.25);
    setZoom(nz); setPan({ x: cx - canvasX * nz, y: cy - canvasY * nz });
  };

  const zoomOut = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const canvasX = (cx - pan.x) / zoom, canvasY = (cy - pan.y) / zoom;
    const nz = Math.max(MIN_ZOOM, zoom / 1.25);
    setZoom(nz); setPan({ x: cx - canvasX * nz, y: cy - canvasY * nz });
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
      <input ref={projectInputRef} type="file" accept=".zoneproj,.json" onChange={importProject} className="hidden" />

      <header className="bg-gray-800/95 backdrop-blur-sm border-b border-gray-700 px-4 py-2 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="text-xl">🏗️</div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Исполнительная документация
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-700 rounded-lg p-0.5">
            <button onClick={() => setTab('canvas')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'canvas' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:text-white'}`}>🗺️ Области</button>
            <button onClick={() => setTab('docs')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'docs' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:text-white'}`}>📑 Документы</button>
          </div>

          <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-medium transition-colors">📁 Загрузить</button>

          {images.length > 0 && (
            <>
              <button onClick={exportProject} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-xs font-medium transition-colors">📦 Сохранить</button>
              <button onClick={() => projectInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-medium transition-colors">📂 Открыть</button>
            </>
          )}

          {activeImage && tab === 'canvas' && (
            <>
              <div className="flex bg-gray-700 rounded-lg p-0.5">
                <button onClick={() => setMode('draw')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'draw' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:text-white'}`}>✏️ Рисование</button>
                <button onClick={() => { setMode('select'); setCurrentPoints([]); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'select' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:text-white'}`}>👆 Выбор</button>
              </div>
              <div className="flex items-center bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
                <button onClick={zoomOut} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded">−</button>
                <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded min-w-[48px] text-center font-mono">{zoomPercent}%</button>
                <button onClick={zoomIn} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded">+</button>
                <div className="w-px h-4 bg-gray-600 mx-0.5"></div>
                <button onClick={() => activeImage && fitToScreen(activeImage.img.width, activeImage.img.height)} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded" title="Вписать">⊡</button>
              </div>
              {activeImage.zones.length > 0 && (
                <>
                  <button onClick={exportData} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-medium transition-colors">💾 Экспорт</button>
                  <button onClick={clearAllZones} className="px-3 py-1.5 bg-red-600/80 hover:bg-red-700 rounded-lg text-xs font-medium transition-colors">🗑️ Очистить</button>
                </>
              )}
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-gray-800/95 border-r border-gray-700 flex flex-col shrink-0 overflow-hidden z-10">
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Изображения ({images.length})</h2>
              <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-blue-400 hover:text-blue-300">+ Добавить</button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {images.length === 0 && <p className="text-gray-600 text-xs italic py-2">Нет изображений</p>}
              {images.map((img) => (
                <div key={img.id} onClick={() => switchImage(img.id)} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all group ${activeImageId === img.id ? 'bg-blue-600/20 ring-1 ring-blue-500/40' : 'hover:bg-white/5'}`}>
                  <div className="w-8 h-8 rounded bg-gray-700 overflow-hidden shrink-0">
                    <img src={img.src} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingImageName === img.id ? (
                      <input type="text" value={tempName} onChange={(e) => setTempName(e.target.value)} onBlur={confirmRename} onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') { setEditingImageName(null); setTempName(''); } e.stopPropagation(); }} autoFocus className="w-full bg-gray-700 text-xs px-1.5 py-0.5 rounded border border-blue-500 outline-none" onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium truncate">{img.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); startRename(img.id, img.name); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 text-[10px]">✎</button>
                      </div>
                    )}
                    <span className="text-[10px] text-gray-500">{img.zones.length} обл. · {img.groups.length} гр.</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteImage(img.id); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs p-1">✕</button>
                </div>
              ))}
            </div>
          </div>

          {tab === 'canvas' && activeImage && (
            <>
              <div className="p-3 border-b border-gray-700">
                <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Категории</h2>
                <div className="space-y-1">
                  {CATEGORIES.map((cat, index) => (
                    <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setMode('draw'); if (currentPoints.length > 0) setCurrentPoints([]); }} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left ${activeCategory === cat.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                      <span className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: cat.color }}></span>
                      <span className="text-xs font-medium flex-1">{cat.name}</span>
                      <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">{index + 1}</span>
                      <span className="text-[10px] font-bold text-gray-400 min-w-[16px] text-center">{activeImage.zones.filter(z => z.category === cat.id).length}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Группы ({activeImage.groups.length})</h2>
                  <button onClick={createGroup} className="text-[10px] text-blue-400 hover:text-blue-300">+ Группа</button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {activeImage.groups.length === 0 && <p className="text-gray-600 text-xs italic">Нет групп</p>}
                  {activeImage.groups.map((group) => (
                    <div key={group.id} onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all group ${selectedGroup === group.id ? 'bg-purple-600/20 ring-1 ring-purple-500/40' : 'hover:bg-white/5'}`}>
                      <span className="text-xs">📁</span>
                      <span className="text-xs font-medium flex-1 truncate">{group.name}</span>
                      <span className="text-[10px] text-gray-500">{group.zoneIds.length}</span>
                      <button onClick={(e) => { e.stopPropagation(); setEditingGroup(group); setShowGroupModal(true); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 text-[10px]">✎</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Области ({activeImage.zones.length})</h2>
                {activeImage.zones.length === 0 ? (
                  <p className="text-gray-600 text-xs italic">Нарисуйте область</p>
                ) : (
                  <div className="space-y-1">
                    {activeImage.zones.map((zone) => {
                      const category = CATEGORIES.find(c => c.id === zone.category);
                      const group = zone.groupId ? activeImage.groups.find(g => g.id === zone.groupId) : null;
                      const isRenaming = renamingZoneId === zone.id;
                      return (
                        <div key={zone.id} onClick={() => { setSelectedZone(zone.id); setMode('select'); }} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all group ${selectedZone === zone.id ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'} ${!zone.visible ? 'opacity-40' : ''}`}>
                          <button onClick={(e) => { e.stopPropagation(); updateZone(zone.id, { visible: !zone.visible }); }} className="text-xs shrink-0 w-4" title={zone.visible ? 'Скрыть' : 'Показать'}>
                            {zone.visible ? '👁️' : '🚫'}
                          </button>
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: category?.color }}></span>
                          {isRenaming ? (
                            <input type="text" value={renameZoneValue} onChange={(e) => setRenameZoneValue(e.target.value)} onBlur={confirmRenameZone} onKeyDown={(e) => { if (e.key === 'Enter') confirmRenameZone(); if (e.key === 'Escape') { setRenamingZoneId(null); setRenameZoneValue(''); } e.stopPropagation(); }} autoFocus className="flex-1 bg-gray-700 text-xs px-1 py-0.5 rounded border border-blue-500 outline-none min-w-0" onClick={(e) => e.stopPropagation()} />
                          ) : (
                            <span className="text-xs flex-1 truncate">{zone.label}</span>
                          )}
                          {group && <span className="text-[9px] text-purple-300 bg-purple-600/30 px-1 rounded shrink-0" title={group.name}>📁</span>}
                          {!isRenaming && <button onClick={(e) => { e.stopPropagation(); startRenameZone(zone.id, zone.label); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 text-[10px]" title="Переименовать">✎</button>}
                          <button onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs">✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-gray-700 bg-gray-800/50">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Управление</h3>
                <div className="grid grid-cols-1 gap-0.5 text-[10px] text-gray-500">
                  <div><kbd className="text-gray-400">ЛКМ</kbd> — точка / выбрать</div>
                  <div><kbd className="text-gray-400">1-я точка</kbd> — замкнуть</div>
                  <div><kbd className="text-gray-400">ПКМ/Esc</kbd> — отмена</div>
                  <div><kbd className="text-gray-400">Колесо</kbd> — масштаб</div>
                  <div><kbd className="text-gray-400">Space+ЛКМ</kbd> — панорама</div>
                  <div><kbd className="text-gray-400">D/V</kbd> — режим</div>
                  <div><kbd className="text-gray-400">1-5</kbd> — категория</div>
                </div>
              </div>
            </>
          )}

          {tab === 'docs' && (
            <div className="flex-1 p-3 overflow-y-auto">
              <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Документация</h2>
              <p className="text-xs text-gray-400 leading-relaxed">В этой вкладке отображаются все группы областей с привязанными документами.</p>
            </div>
          )}
        </aside>

        <main className="flex-1 relative overflow-hidden bg-gray-950">
          {tab === 'canvas' ? (
            <div ref={viewportRef} className={`absolute inset-0 select-none ${isPanning || spaceHeld ? 'cursor-grabbing' : (mode === 'draw' ? 'cursor-crosshair' : 'cursor-pointer')}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={() => { setIsPanning(false); setMousePos(null); }} onContextMenu={(e) => { e.preventDefault(); if (currentPoints.length > 0) setCurrentPoints([]); }}>
              <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

              {!activeImage ? (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="text-center max-w-md">
                    <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-700 rounded-2xl p-10 cursor-pointer hover:border-blue-500/50 hover:bg-gray-800/30 transition-all group mb-4">
                      <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🖼️</div>
                      <h2 className="text-lg font-semibold text-gray-300 mb-2">Загрузите изображение</h2>
                      <p className="text-gray-500 text-sm mb-4">План помещения для разметки зон</p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm"><span>📁</span><span>Выбрать файл</span></div>
                    </div>
                    <button onClick={() => projectInputRef.current?.click()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-400 text-sm hover:bg-purple-600/30 transition-all"><span>📂</span><span>Открыть проект</span></button>
                  </div>
                </div>
              ) : (
                <div style={{ position: 'absolute', left: pan.x, top: pan.y, transformOrigin: '0 0', transform: `scale(${zoom})` }}>
                  <canvas ref={canvasRef} width={activeImage.canvasSize.width} height={activeImage.canvasSize.height} onClick={handleCanvasClick} className="rounded shadow-2xl" style={{ display: 'block', imageRendering: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 25px 50px -12px rgba(0,0,0,0.8)' }} />
                </div>
              )}

              {activeImage && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-800/95 backdrop-blur-sm rounded-full px-4 py-2 text-xs flex items-center gap-3 shadow-lg ring-1 ring-white/10 pointer-events-none">
                  <span className="text-gray-300 font-medium truncate max-w-[120px]">📄 {activeImage.name}</span>
                  <span className="text-gray-600">•</span>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORIES.find(c => c.id === activeCategory)?.color }}></span>
                  <span className="text-gray-300">{CATEGORIES.find(c => c.id === activeCategory)?.name}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-400">{mode === 'draw' ? '✏️' : '👆'}</span>
                  {currentPoints.length > 0 && mode === 'draw' && (<><span className="text-gray-600">•</span><span className="text-yellow-400">{currentPoints.length}т{currentPoints.length >= 3 && ' → замкните'}</span></>)}
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-400">{zoomPercent}%</span>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 overflow-auto p-6">
              {!activeImage ? (
                <div className="text-center py-20"><div className="text-5xl mb-4 opacity-30">📑</div><p className="text-gray-500">Загрузите изображение</p></div>
              ) : (
                <div className="max-w-6xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white">📑 Документация</h2>
                      <p className="text-sm text-gray-400 mt-1">{activeImage.name} · {activeImage.groups.length} групп · {activeImage.zones.length} областей</p>
                    </div>
                    <button onClick={createGroup} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors">+ Новая группа</button>
                  </div>

                  {activeImage.groups.length === 0 && activeImage.zones.length === 0 ? (
                    <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-gray-700">
                      <div className="text-4xl mb-3 opacity-50">📋</div>
                      <p className="text-gray-400 mb-2">Нет данных</p>
                      <button onClick={() => setTab('canvas')} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors">Перейти к областям</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeImage.groups.map((group) => {
                        const groupZones = activeImage.zones.filter(z => group.zoneIds.includes(z.id));
                        return (
                          <div key={group.id} className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                            <div className="p-4 border-b border-gray-700 flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-lg">📁</span>
                                  <h3 className="text-lg font-semibold text-white">{group.name}</h3>
                                  <button onClick={() => { setEditingGroup(group); setShowGroupModal(true); }} className="text-xs text-gray-400 hover:text-blue-400 transition-colors">✎ Редактировать</button>
                                </div>
                                {group.notes && <p className="text-sm text-gray-400 mt-1">{group.notes}</p>}
                              </div>
                              <button onClick={() => goToGroup(group.id)} className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-xs text-blue-400 transition-colors" title="Показать на плане">🗺️ На плане</button>
                            </div>

                            <div className="p-4 border-b border-gray-700 bg-gray-900/30 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">📄 PDF документ</label>
                                {group.pdfUrl ? (
                                  <a href={group.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-xs text-red-300 transition-colors">
                                    <span>📕</span><span className="truncate max-w-[200px]">{group.pdfUrl}</span><span>↗</span>
                                  </a>
                                ) : <span className="text-xs text-gray-600 italic">Не указана</span>}
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">📊 Таблица</label>
                                {group.tableUrl ? (
                                  <a href={group.tableUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 transition-colors">
                                    <span>📗</span><span className="truncate max-w-[200px]">{group.tableUrl}</span><span>↗</span>
                                  </a>
                                ) : <span className="text-xs text-gray-600 italic">Не указана</span>}
                              </div>
                            </div>

                            <div className="p-4">
                              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Области в группе ({groupZones.length})</h4>
                              {groupZones.length === 0 ? <p className="text-xs text-gray-600 italic">Нет областей</p> : (
                                <div className="flex flex-wrap gap-2">
                                  {groupZones.map((zone) => {
                                    const category = CATEGORIES.find(c => c.id === zone.category);
                                    return (
                                      <button key={zone.id} onClick={() => goToZone(zone.id)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 hover:border-blue-500/50 rounded-lg text-xs transition-all group">
                                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: category?.color }}></span>
                                        <span className="text-gray-200">{zone.label}</span>
                                        <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {activeImage.zones.filter(z => !z.groupId).length > 0 && (
                        <div className="bg-gray-800/30 rounded-xl border border-dashed border-gray-700 p-4">
                          <h3 className="text-sm font-semibold text-gray-400 mb-3">⚠️ Области без группы ({activeImage.zones.filter(z => !z.groupId).length})</h3>
                          <div className="flex flex-wrap gap-2">
                            {activeImage.zones.filter(z => !z.groupId).map((zone) => {
                              const category = CATEGORIES.find(c => c.id === zone.category);
                              return (
                                <button key={zone.id} onClick={() => goToZone(zone.id)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/30 hover:bg-gray-700 border border-gray-600 hover:border-blue-500/50 rounded-lg text-xs transition-all group">
                                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: category?.color }}></span>
                                  <span className="text-gray-300">{zone.label}</span>
                                  <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showGroupModal && editingGroup && activeImage && (
        <GroupModal group={editingGroup} allZones={activeImage.zones} onSave={(patch) => { updateGroup(editingGroup.id, patch); setShowGroupModal(false); setEditingGroup(null); }} onClose={() => { setShowGroupModal(false); setEditingGroup(null); }} onToggleZone={(zoneId) => toggleZoneInGroup(editingGroup.id, zoneId)} />
      )}

      {exportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">{exportModal.type === 'project' ? '📦 Сохранение проекта' : '💾 Экспорт'}</h2>
              <button onClick={() => setExportModal(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <p className="text-sm text-gray-400 mb-1">Файл: <span className="text-white font-mono">{exportModal.filename}</span></p>
              <p className="text-sm text-gray-400 mb-3">Размер: <span className="text-white">{(exportModal.content.length / 1024).toFixed(1)} KB</span></p>
              <div className="flex gap-2 mb-4">
                <button onClick={downloadFromModal} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium">⬇️ Скачать</button>
                <button onClick={openInNewTab} className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium">🔗 Вкладка</button>
                <button onClick={copyToClipboard} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium">📋 Копировать</button>
              </div>
              <div className="flex-1 overflow-auto bg-gray-900 rounded-lg p-3">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">{exportModal.content.length > 50000 ? exportModal.content.slice(0, 50000) + '\n\n... (обрезано)' : exportModal.content}</pre>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button onClick={() => setExportModal(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium">Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupModal({ group, allZones, onSave, onClose, onToggleZone }: { group: Group; allZones: Zone[]; onSave: (patch: Partial<Group>) => void; onClose: () => void; onToggleZone: (zoneId: string) => void; }) {
  const [name, setName] = useState(group.name);
  const [pdfUrl, setPdfUrl] = useState(group.pdfUrl);
  const [tableUrl, setTableUrl] = useState(group.tableUrl);
  const [notes, setNotes] = useState(group.notes);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">📁 Редактирование группы</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-1 block">Название группы</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" placeholder="Например: 1 этаж, секция А" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1 block">📄 Ссылка на PDF</label>
              <input type="url" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1 block">📊 Ссылка на таблицу</label>
              <input type="url" value={tableUrl} onChange={(e) => setTableUrl(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-1 block">📝 Заметки</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 resize-none" placeholder="Описание работ..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-2 block">Области в группе ({group.zoneIds.length})</label>
            {allZones.length === 0 ? <p className="text-xs text-gray-600 italic">Нет областей</p> : (
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto bg-gray-900/50 rounded-lg p-2">
                {allZones.map((zone) => {
                  const category = CATEGORIES.find(c => c.id === zone.category);
                  const isInGroup = group.zoneIds.includes(zone.id);
                  return (
                    <button key={zone.id} onClick={() => onToggleZone(zone.id)} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-all ${isInGroup ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-gray-800 hover:bg-gray-700 border border-transparent'}`}>
                      <span className={`w-3 h-3 rounded-sm shrink-0 border-2 ${isInGroup ? 'bg-purple-500 border-purple-400' : 'border-gray-600'}`}></span>
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: category?.color }}></span>
                      <span className="flex-1 truncate">{zone.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium">Отмена</button>
          <button onClick={() => onSave({ name: name.trim() || 'Без имени', pdfUrl, tableUrl, notes })} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium">Сохранить</button>
        </div>
      </div>
    </div>
  );
}

export default App;
