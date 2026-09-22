import { useState, useRef, useEffect, useCallback } from 'react';

// Типы
interface Point {
  x: number;
  y: number;
}

interface Zone {
  id: string;
  points: Point[];
  category: string;
  label: string;
}

interface ImageData {
  id: string;
  name: string;
  src: string;
  img: HTMLImageElement;
  canvasSize: { width: number; height: number };
  zones: Zone[];
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
  { id: 'engineering', name: 'Инженерные системы', color: '#EF4444' },
];

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function App() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('floor');
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [mode, setMode] = useState<'draw' | 'select'>('draw');
  const [editingImageName, setEditingImageName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [exportModal, setExportModal] = useState<{ data: string; filename: string; type: string } | null>(null);

  // Zoom/Pan state
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

  // Загрузка изображения
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
            id,
            name,
            src,
            img,
            canvasSize: { width: img.width, height: img.height },
            zones: [],
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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Вписать изображение в экран
  const fitToScreen = useCallback((imgWidth?: number, imgHeight?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const w = imgWidth ?? activeImage?.img.width ?? 0;
    const h = imgHeight ?? activeImage?.img.height ?? 0;
    if (!w || !h) return;

    const padding = 40;
    const vw = viewport.clientWidth - padding * 2;
    const vh = viewport.clientHeight - padding * 2;

    const scaleX = vw / w;
    const scaleY = vh / h;
    const newZoom = Math.min(scaleX, scaleY, 1);

    setZoom(newZoom);
    setPan({
      x: (vw - w * newZoom) / 2,
      y: (vh - h * newZoom) / 2,
    });
  }, [activeImage]);

  // Переключение на другое изображение
  const switchImage = (id: string) => {
    setActiveImageId(id);
    setCurrentPoints([]);
    setSelectedZone(null);
    const img = images.find(i => i.id === id);
    if (img) {
      setTimeout(() => fitToScreen(img.img.width, img.img.height), 30);
    }
  };

  // Получение координат мыши в координатах canvas
  const getCanvasCoords = (e: React.MouseEvent): Point => {
    const viewport = viewportRef.current;
    if (!viewport || !activeImage) return { x: 0, y: 0 };

    const viewportRect = viewport.getBoundingClientRect();
    const mouseXInViewport = e.clientX - viewportRect.left;
    const mouseYInViewport = e.clientY - viewportRect.top;

    const x = (mouseXInViewport - pan.x) / zoom;
    const y = (mouseYInViewport - pan.y) / zoom;

    return { x, y };
  };

  // Wheel — зум к курсору
  const zoomRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  zoomRef.current = { zoom, pan };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      if (!activeImage) return;

      const viewportRect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - viewportRect.left;
      const mouseY = e.clientY - viewportRect.top;

      const { zoom: currentZoom, pan: currentPan } = zoomRef.current;

      const canvasX = (mouseX - currentPan.x) / currentZoom;
      const canvasY = (mouseY - currentPan.y) / currentZoom;

      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * (1 + delta)));

      const newPanX = mouseX - canvasX * newZoom;
      const newPanY = mouseY - canvasY * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    viewport.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheelEvent);
  }, [activeImage]);

  // Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    setDragDistance(0);

    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - mouseDownPos.current.x;
    const dy = e.clientY - mouseDownPos.current.y;
    setDragDistance(Math.sqrt(dx * dx + dy * dy));

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }
    if (!activeImage) return;
    setMousePos(getCanvasCoords(e));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Клик по canvas
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!activeImage) return;
    if (isPanning || spaceHeld) return;
    if (dragDistance > 5) return;

    const point = getCanvasCoords(e);

    if (mode === 'select') {
      for (let i = activeImage.zones.length - 1; i >= 0; i--) {
        if (isPointInPolygon(point, activeImage.zones[i].points)) {
          setSelectedZone(activeImage.zones[i].id);
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
      const snapRadius = 15 / zoom;
      if (distance < snapRadius) {
        const newZone: Zone = {
          id: Date.now().toString(),
          points: [...currentPoints],
          category: activeCategory,
          label: `${CATEGORIES.find(c => c.id === activeCategory)?.name} ${activeImage.zones.filter(z => z.category === activeCategory).length + 1}`,
        };
        updateImageZones([...activeImage.zones, newZone]);
        setCurrentPoints([]);
        return;
      }
    }

    setCurrentPoints([...currentPoints, point]);
  };

  const updateImageZones = (zones: Zone[]) => {
    setImages(prev => prev.map(img =>
      img.id === activeImageId ? { ...img, zones } : img
    ));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (currentPoints.length > 0) {
      setCurrentPoints([]);
    }
  };

  // Горячие клавиши
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingImageName) return;

      if (e.key === ' ') {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === 'Escape') {
        if (currentPoints.length > 0) {
          setCurrentPoints([]);
        } else {
          setSelectedZone(null);
        }
      }
      if (e.key === 'Delete' && selectedZone && activeImage) {
        updateImageZones(activeImage.zones.filter(z => z.id !== selectedZone));
        setSelectedZone(null);
      }
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
        setMode('select');
        setCurrentPoints([]);
      }
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
        setMode('draw');
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 5) {
        setActiveCategory(CATEGORIES[num - 1].id);
        setMode('draw');
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (activeImage) fitToScreen(activeImage.img.width, activeImage.img.height);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setSpaceHeld(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedZone, activeImage, currentPoints, editingImageName, fitToScreen]);

  // Отрисовка canvas
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

    // Зоны
    activeImage.zones.forEach((zone) => {
      const category = CATEGORIES.find(c => c.id === zone.category);
      if (!category) return;

      ctx.beginPath();
      ctx.moveTo(zone.points[0].x, zone.points[0].y);
      for (let i = 1; i < zone.points.length; i++) {
        ctx.lineTo(zone.points[i].x, zone.points[i].y);
      }
      ctx.closePath();

      const isSelected = zone.id === selectedZone;
      ctx.fillStyle = category.color + (isSelected ? '55' : '25');
      ctx.fill();
      ctx.strokeStyle = category.color;
      ctx.lineWidth = (isSelected ? 3 : 1.5) / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      const centerX = zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length;
      const centerY = zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length;
      const fontSize = Math.max(10, 12 / zoom);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3 / zoom;
      ctx.strokeText(zone.label, centerX, centerY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(zone.label, centerX, centerY);
    });

    // Текущий полигон
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
        ctx.setLineDash([]);
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

        if (currentPoints.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(mousePos.x, mousePos.y);
          ctx.lineTo(currentPoints[0].x, currentPoints[0].y);
          ctx.strokeStyle = category.color + '60';
          ctx.lineWidth = 1 / zoom;
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
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

        if (isFirst) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius * 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = category.color + '80';
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();
        }
      });

      if (mousePos && currentPoints.length >= 3) {
        const firstPoint = currentPoints[0];
        const distance = Math.sqrt(
          Math.pow(mousePos.x - firstPoint.x, 2) + Math.pow(mousePos.y - firstPoint.y, 2)
        );
        const snapRadius = 15 / zoom;
        if (distance < snapRadius) {
          ctx.beginPath();
          ctx.arc(firstPoint.x, firstPoint.y, snapRadius, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }, [activeImage, currentPoints, mousePos, activeCategory, selectedZone, mode, zoom]);

  const deleteZone = (zoneId: string) => {
    if (!activeImage) return;
    updateImageZones(activeImage.zones.filter(z => z.id !== zoneId));
    if (selectedZone === zoneId) setSelectedZone(null);
  };

  const clearAllZones = () => {
    if (!activeImage) return;
    if (window.confirm('Удалить все выделенные области на этом изображении?')) {
      updateImageZones([]);
      setCurrentPoints([]);
      setSelectedZone(null);
    }
  };

  // Экспорт только зон
  const exportData = () => {
    const data = {
      images: images.map(img => ({
        name: img.name,
        zones: img.zones.map(z => ({
          label: z.label,
          categoryId: z.category,
          categoryName: CATEGORIES.find(c => c.id === z.category)?.name,
          points: z.points,
        })),
      })),
    };
    setExportModal({
      data: JSON.stringify(data, null, 2),
      filename: 'zones-export.json',
      type: 'zones'
    });
  };

  // Экспорт полного проекта
  const exportProject = () => {
    const projectData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      activeImageId: activeImageId,
      images: images.map(img => ({
        id: img.id,
        name: img.name,
        src: img.src,
        width: img.canvasSize.width,
        height: img.canvasSize.height,
        zones: img.zones.map(z => ({
          id: z.id,
          label: z.label,
          category: z.category,
          points: z.points,
        })),
      })),
    };
    const date = new Date().toISOString().slice(0, 10);
    setExportModal({
      data: JSON.stringify(projectData),
      filename: `project-${date}.zoneproj`,
      type: 'project'
    });
  };

  const downloadFromModal = () => {
    if (!exportModal) return;
    const blob = new Blob([exportModal.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportModal.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openInNewTab = () => {
    if (!exportModal) return;
    const blob = new Blob([exportModal.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const copyToClipboard = async () => {
    if (!exportModal) return;
    try {
      await navigator.clipboard.writeText(exportModal.data);
      alert('Скопировано в буфер обмена!');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = exportModal.data;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Скопировано в буфер обмена!');
    }
  };

  // Импорт проекта
  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);

        if (!data.images || !Array.isArray(data.images)) {
          alert('Неверный формат файла проекта');
          return;
        }

        const loadPromises = data.images.map((imgData: any) => {
          return new Promise<ImageData>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              resolve({
                id: imgData.id || Date.now().toString() + Math.random().toString(36).slice(2),
                name: imgData.name || 'Без имени',
                src: imgData.src,
                img,
                canvasSize: {
                  width: imgData.width || img.width,
                  height: imgData.height || img.height,
                },
                zones: (imgData.zones || []).map((z: any) => ({
                  id: z.id || Date.now().toString() + Math.random().toString(36).slice(2),
                  label: z.label || 'Область',
                  category: z.category || 'floor',
                  points: z.points || [],
                })),
              });
            };
            img.onerror = () => reject(new Error(`Не удалось загрузить: ${imgData.name}`));
            img.src = imgData.src;
          });
        });

        Promise.all(loadPromises)
          .then(loadedImages => {
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
              if (activeImg) {
                fitToScreen(activeImg.img.width, activeImg.img.height);
              }
            }, 100);

            alert(`Проект загружен: ${loadedImages.length} изобр., ${loadedImages.reduce((sum, i) => sum + i.zones.length, 0)} областей`);
          })
          .catch(err => {
            alert(`Ошибка: ${err.message}`);
          });
      } catch {
        alert('Ошибка чтения файла');
      }
    };
    reader.readAsText(file);

    if (projectInputRef.current) {
      projectInputRef.current.value = '';
    }
  };

  const deleteImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    if (activeImageId === id) {
      const remaining = images.filter(img => img.id !== id);
      setActiveImageId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const startRename = (id: string, currentName: string) => {
    setEditingImageName(id);
    setTempName(currentName);
  };

  const confirmRename = () => {
    if (editingImageName && tempName.trim()) {
      setImages(prev => prev.map(img =>
        img.id === editingImageName ? { ...img, name: tempName.trim() } : img
      ));
    }
    setEditingImageName(null);
    setTempName('');
  };

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

  const zoomIn = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const canvasX = (centerX - pan.x) / zoom;
    const canvasY = (centerY - pan.y) / zoom;
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.25);
    setZoom(newZoom);
    setPan({ x: centerX - canvasX * newZoom, y: centerY - canvasY * newZoom });
  };

  const zoomOut = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const canvasX = (centerX - pan.x) / zoom;
    const canvasY = (centerY - pan.y) / zoom;
    const newZoom = Math.max(MIN_ZOOM, zoom / 1.25);
    setZoom(newZoom);
    setPan({ x: centerX - canvasX * newZoom, y: centerY - canvasY * newZoom });
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".zoneproj,.json"
        onChange={importProject}
        className="hidden"
      />

      {/* Header */}
      <header className="bg-gray-800/95 backdrop-blur-sm border-b border-gray-700 px-4 py-2 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="text-xl">🏗️</div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Зонирование
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span>📁</span>
            <span>Загрузить</span>
          </button>

          {activeImage && (
            <>
              <div className="flex bg-gray-700 rounded-lg p-0.5 mx-1">
                <button
                  onClick={() => setMode('draw')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    mode === 'draw' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  ✏️ Рисование
                </button>
                <button
                  onClick={() => {
                    setMode('select');
                    setCurrentPoints([]);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    mode === 'select' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  👆 Выбор
                </button>
              </div>

              <div className="flex items-center bg-gray-700/50 rounded-lg p-0.5 gap-0.5">
                <button onClick={zoomOut} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded transition-colors" title="Уменьшить">−</button>
                <button onClick={resetZoom} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded transition-colors min-w-[48px] text-center font-mono" title="Сбросить">{zoomPercent}%</button>
                <button onClick={zoomIn} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded transition-colors" title="Увеличить">+</button>
                <div className="w-px h-4 bg-gray-600 mx-0.5"></div>
                <button onClick={() => activeImage && fitToScreen(activeImage.img.width, activeImage.img.height)} className="px-2 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-600 rounded transition-colors" title="Вписать">⊡</button>
              </div>

              <div className="flex items-center gap-1 mx-1">
                <button
                  onClick={exportProject}
                  disabled={images.length === 0}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-xs font-medium transition-colors"
                  title="Сохранить проект"
                >
                  📦 Сохранить
                </button>
                <button
                  onClick={() => projectInputRef.current?.click()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-medium transition-colors"
                  title="Загрузить проект"
                >
                  📂 Открыть
                </button>
              </div>

              {activeImage.zones.length > 0 && (
                <>
                  <button onClick={exportData} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-medium transition-colors" title="Экспорт зон">💾 Экспорт зон</button>
                  <button onClick={clearAllZones} className="px-3 py-1.5 bg-red-600/80 hover:bg-red-700 rounded-lg text-xs font-medium transition-colors">🗑️ Очистить</button>
                </>
              )}
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-800/95 border-r border-gray-700 flex flex-col shrink-0 overflow-hidden z-10">
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Изображения ({images.length})</h2>
              <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">+ Добавить</button>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {images.length === 0 && <p className="text-gray-600 text-xs italic py-2">Нет загруженных изображений</p>}
              {images.map((img) => (
                <div
                  key={img.id}
                  onClick={() => switchImage(img.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all group ${
                    activeImageId === img.id ? 'bg-blue-600/20 ring-1 ring-blue-500/40' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="w-8 h-8 rounded bg-gray-700 overflow-hidden shrink-0 flex items-center justify-center">
                    <img src={img.src} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingImageName === img.id ? (
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onBlur={confirmRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmRename();
                          if (e.key === 'Escape') { setEditingImageName(null); setTempName(''); }
                          e.stopPropagation();
                        }}
                        autoFocus
                        className="w-full bg-gray-700 text-xs px-1.5 py-0.5 rounded border border-blue-500 outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium truncate">{img.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); startRename(img.id, img.name); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 transition-all text-[10px]" title="Переименовать">✎</button>
                      </div>
                    )}
                    <span className="text-[10px] text-gray-500">{img.zones.length} обл.</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteImage(img.id); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all text-xs p-1" title="Удалить">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 border-b border-gray-700">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Категории</h2>
            <div className="space-y-1">
              {CATEGORIES.map((cat, index) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setMode('draw');
                    if (currentPoints.length > 0) setCurrentPoints([]);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left ${
                    activeCategory === cat.id ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: cat.color }}></span>
                  <span className="text-xs font-medium flex-1">{cat.name}</span>
                  <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">{index + 1}</span>
                  <span className="text-[10px] font-bold text-gray-400 min-w-[16px] text-center">
                    {activeImage ? activeImage.zones.filter(z => z.category === cat.id).length : 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
              Области ({activeImage ? activeImage.zones.length : 0})
            </h2>
            {!activeImage ? (
              <p className="text-gray-600 text-xs italic">Загрузите изображение</p>
            ) : activeImage.zones.length === 0 ? (
              <p className="text-gray-600 text-xs italic">Нет выделенных областей</p>
            ) : (
              <div className="space-y-1">
                {activeImage.zones.map((zone) => {
                  const category = CATEGORIES.find(c => c.id === zone.category);
                  return (
                    <div
                      key={zone.id}
                      onClick={() => { setSelectedZone(zone.id); setMode('select'); }}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all group ${
                        selectedZone === zone.id ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: category?.color }}></span>
                      <span className="text-xs flex-1 truncate">{zone.label}</span>
                      <button onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all text-xs">✕</button>
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
              <div><kbd className="text-gray-400">Ctrl+0</kbd> — вписать</div>
              <div><kbd className="text-gray-400">D/V</kbd> — режим</div>
              <div><kbd className="text-gray-400">1-5</kbd> — категория</div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main
          ref={viewportRef}
          className={`flex-1 relative overflow-hidden bg-gray-950 select-none ${
            isPanning || spaceHeld ? 'cursor-grabbing' : (mode === 'draw' ? 'cursor-crosshair' : 'cursor-pointer')
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsPanning(false); setMousePos(null); }}
          onContextMenu={handleContextMenu}
        >
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}></div>

          {!activeImage ? (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-700 rounded-2xl p-10 cursor-pointer hover:border-blue-500/50 hover:bg-gray-800/30 transition-all group mb-4"
                >
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🖼️</div>
                  <h2 className="text-lg font-semibold text-gray-300 mb-2">Загрузите изображение</h2>
                  <p className="text-gray-500 text-sm mb-4">План помещения, чертёж или фото</p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm">
                    <span>📁</span>
                    <span>Нажмите для выбора файла</span>
                  </div>
                  <p className="text-gray-600 text-xs mt-3">Можно загрузить несколько файлов сразу</p>
                </div>

                <button
                  onClick={() => projectInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-400 text-sm hover:bg-purple-600/30 transition-all"
                >
                  <span>📂</span>
                  <span>Открыть сохранённый проект</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              position: 'absolute',
              left: pan.x,
              top: pan.y,
              transformOrigin: '0 0',
              transform: `scale(${zoom})`,
            }}>
              <canvas
                ref={canvasRef}
                width={activeImage.canvasSize.width}
                height={activeImage.canvasSize.height}
                onClick={handleCanvasClick}
                className="rounded shadow-2xl"
                style={{
                  display: 'block',
                  imageRendering: 'auto',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 25px 50px -12px rgba(0,0,0,0.8)',
                }}
              />
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
              {currentPoints.length > 0 && mode === 'draw' && (
                <>
                  <span className="text-gray-600">•</span>
                  <span className="text-yellow-400">{currentPoints.length}т{currentPoints.length >= 3 && ' → замкните'}</span>
                </>
              )}
              <span className="text-gray-600">•</span>
              <span className="text-gray-400">{zoomPercent}%</span>
            </div>
          )}
        </main>
      </div>

      {/* Модальное окно экспорта */}
      {exportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">
                {exportModal.type === 'project' ? '📦 Сохранение проекта' : '💾 Экспорт зон'}
              </h2>
              <button onClick={() => setExportModal(null)} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <p className="text-sm text-gray-400 mb-1">
                Файл: <span className="text-white font-mono">{exportModal.filename}</span>
              </p>
              <p className="text-sm text-gray-400 mb-3">
                Размер: <span className="text-white">{(exportModal.data.length / 1024).toFixed(1)} KB</span>
              </p>
              <div className="flex gap-2 mb-4">
                <button onClick={downloadFromModal} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors">⬇️ Скачать</button>
                <button onClick={openInNewTab} className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors">🔗 Новая вкладка</button>
                <button onClick={copyToClipboard} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors">📋 Копировать</button>
              </div>
              <div className="flex-1 overflow-auto bg-gray-900 rounded-lg p-3">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
                  {exportModal.data.length > 50000 ? exportModal.data.slice(0, 50000) + '\n\n... (обрезано)' : exportModal.data}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button onClick={() => setExportModal(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
