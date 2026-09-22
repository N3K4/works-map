import { useState, useRef, useEffect } from 'react';

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

const CATEGORIES = [
  { id: 'floor', name: 'Пол', color: '#8B5CF6' },
  { id: 'ceiling', name: 'Потолок', color: '#06B6D4' },
  { id: 'walls', name: 'Стены', color: '#F59E0B' },
  { id: 'partitions', name: 'Перегородки', color: '#10B981' },
  { id: 'engineering', name: 'Инж. системы', color: '#EF4444' },
];

function App() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [activeCategory, setActiveCategory] = useState('floor');
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [mode, setMode] = useState<'draw' | 'select'>('draw');
  const [tab, setTab] = useState<'canvas' | 'docs'>('canvas');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [renamingZone, setRenamingZone] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [exportModal, setExportModal] = useState<{ content: string; filename: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
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
          setImages(prev => [...prev, {
            id, name, src, img,
            canvasSize: { width: img.width, height: img.height },
            zones: [], groups: [],
          }]);
          setActiveImageId(id);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  };

  const getCanvasCoords = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas || !activeImage) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom - pan.x / zoom,
      y: (e.clientY - rect.top) / zoom - pan.y / zoom,
    };
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!activeImage || mode !== 'draw') return;
    const point = getCanvasCoords(e);

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
        setImages(prev => prev.map(img =>
          img.id === activeImageId ? { ...img, zones: [...img.zones, newZone] } : img
        ));
        setCurrentPoints([]);
        return;
      }
    }
    setCurrentPoints([...currentPoints, point]);
  };

  const updateZone = (zoneId: string, patch: Partial<Zone>) => {
    if (!activeImage) return;
    setImages(prev => prev.map(img =>
      img.id === activeImageId ? {
        ...img,
        zones: img.zones.map(z => z.id === zoneId ? { ...z, ...patch } : z)
      } : img
    ));
  };

  const deleteZone = (zoneId: string) => {
    if (!activeImage) return;
    setImages(prev => prev.map(img =>
      img.id === activeImageId ? { ...img, zones: img.zones.filter(z => z.id !== zoneId) } : img
    ));
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
    setImages(prev => prev.map(img =>
      img.id === activeImageId ? { ...img, groups: [...img.groups, newGroup] } : img
    ));
    setEditingGroup(newGroup);
  };

  const updateGroup = (groupId: string, patch: Partial<Group>) => {
    if (!activeImage) return;
    setImages(prev => prev.map(img =>
      img.id === activeImageId ? {
        ...img,
        groups: img.groups.map(g => g.id === groupId ? { ...g, ...patch } : g)
      } : img
    ));
  };

  const deleteGroup = (groupId: string) => {
    if (!activeImage) return;
    setImages(prev => prev.map(img =>
      img.id === activeImageId ? {
        ...img,
        groups: img.groups.filter(g => g.id !== groupId),
        zones: img.zones.map(z => z.groupId === groupId ? { ...z, groupId: null } : z)
      } : img
    ));
  };

  const toggleZoneInGroup = (groupId: string, zoneId: string) => {
    if (!activeImage) return;
    const group = activeImage.groups.find(g => g.id === groupId);
    if (!group) return;
    const isIn = group.zoneIds.includes(zoneId);
    const newZoneIds = isIn ? group.zoneIds.filter(id => id !== zoneId) : [...group.zoneIds, zoneId];
    updateGroup(groupId, { zoneIds: newZoneIds });
    updateZone(zoneId, { groupId: isIn ? null : groupId });
  };

  const exportProject = () => {
    const projectData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      activeImageId,
      images: images.map(img => ({
        id: img.id,
        name: img.name,
        src: img.src,
        width: img.canvasSize.width,
        height: img.canvasSize.height,
        zones: img.zones,
        groups: img.groups,
      })),
    };
    const content = JSON.stringify(projectData);
    const filename = `project-${new Date().toISOString().slice(0, 10)}.zoneproj`;
    setExportModal({ content, filename });
  };

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.images) return;
        const loadPromises = data.images.map((imgData: any) => new Promise<ImageData>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({
            id: imgData.id,
            name: imgData.name,
            src: imgData.src,
            img,
            canvasSize: { width: imgData.width, height: imgData.height },
            zones: imgData.zones || [],
            groups: imgData.groups || [],
          });
          img.src = imgData.src;
        }));
        Promise.all(loadPromises).then(loadedImages => {
          setImages(loadedImages);
          setActiveImageId(data.activeImageId || loadedImages[0]?.id || null);
        });
      } catch (err) {
        alert('Ошибка загрузки проекта');
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = activeImage.canvasSize.width;
    canvas.height = activeImage.canvasSize.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(activeImage.img, 0, 0, canvas.width, canvas.height);

    activeImage.zones.forEach((zone) => {
      if (!zone.visible) return;
      const category = CATEGORIES.find(c => c.id === zone.category);
      if (!category) return;

      ctx.beginPath();
      ctx.moveTo(zone.points[0].x, zone.points[0].y);
      for (let i = 1; i < zone.points.length; i++) {
        ctx.lineTo(zone.points[i].x, zone.points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = category.color + '40';
      ctx.fill();
      ctx.strokeStyle = category.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      const centerX = zone.points.reduce((s, p) => s + p.x, 0) / zone.points.length;
      const centerY = zone.points.reduce((s, p) => s + p.y, 0) / zone.points.length;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(zone.label, centerX, centerY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(zone.label, centerX, centerY);
    });

    if (currentPoints.length > 0 && mode === 'draw') {
      const category = CATEGORIES.find(c => c.id === activeCategory);
      if (!category) return;

      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      }
      if (mousePos) ctx.lineTo(mousePos.x, mousePos.y);
      ctx.strokeStyle = category.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      currentPoints.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, index === 0 && currentPoints.length >= 3 ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 && currentPoints.length >= 3 ? '#ffffff' : category.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }, [activeImage, currentPoints, mousePos, activeCategory, zoom, pan, mode]);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
      <input ref={projectInputRef} type="file" accept=".zoneproj,.json" onChange={importProject} className="hidden" />

      <header className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <h1 className="text-lg font-bold">🏗️ Исполнительная документация</h1>
        <div className="flex gap-2">
          <div className="flex bg-gray-700 rounded">
            <button onClick={() => setTab('canvas')} className={`px-3 py-1 rounded text-sm ${tab === 'canvas' ? 'bg-blue-600' : ''}`}>🗺️ Области</button>
            <button onClick={() => setTab('docs')} className={`px-3 py-1 rounded text-sm ${tab === 'docs' ? 'bg-blue-600' : ''}`}>📑 Документы</button>
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1 bg-gray-700 rounded text-sm">📁 Загрузить</button>
          {images.length > 0 && (
            <>
              <button onClick={exportProject} className="px-3 py-1 bg-purple-600 rounded text-sm">📦 Сохранить</button>
              <button onClick={() => projectInputRef.current?.click()} className="px-3 py-1 bg-indigo-600 rounded text-sm">📂 Открыть</button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-700">
            <h2 className="text-xs font-bold text-gray-400 mb-2">ИЗОБРАЖЕНИЯ ({images.length})</h2>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {images.map(img => (
                <div
                  key={img.id}
                  onClick={() => setActiveImageId(img.id)}
                  className={`p-2 rounded cursor-pointer ${activeImageId === img.id ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                >
                  <div className="text-xs font-medium truncate">{img.name}</div>
                  <div className="text-[10px] text-gray-400">{img.zones.length} обл. · {img.groups.length} гр.</div>
                </div>
              ))}
            </div>
          </div>

          {tab === 'canvas' && activeImage && (
            <>
              <div className="p-3 border-b border-gray-700">
                <h2 className="text-xs font-bold text-gray-400 mb-2">КАТЕГОРИИ</h2>
                <div className="space-y-1">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setActiveCategory(cat.id); setMode('draw'); }}
                      className={`w-full flex items-center gap-2 p-2 rounded ${activeCategory === cat.id ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
                    >
                      <span className="w-3 h-3 rounded" style={{ backgroundColor: cat.color }}></span>
                      <span className="text-xs flex-1">{cat.name}</span>
                      <span className="text-[10px] text-gray-400">{activeImage.zones.filter(z => z.category === cat.id).length}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-gray-400">ГРУППЫ ({activeImage.groups.length})</h2>
                  <button onClick={createGroup} className="text-[10px] text-blue-400">+ Группа</button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {activeImage.groups.map(group => (
                    <div
                      key={group.id}
                      onClick={() => setEditingGroup(group)}
                      className="flex items-center gap-2 p-2 rounded hover:bg-gray-700 cursor-pointer"
                    >
                      <span className="text-xs">📁</span>
                      <span className="text-xs flex-1 truncate">{group.name}</span>
                      <span className="text-[10px] text-gray-400">{group.zoneIds.length}</span>
                      <button onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }} className="text-xs text-red-400">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <h2 className="text-xs font-bold text-gray-400 mb-2">ОБЛАСТИ ({activeImage.zones.length})</h2>
                <div className="space-y-1">
                  {activeImage.zones.map(zone => {
                    const category = CATEGORIES.find(c => c.id === zone.category);
                    const group = zone.groupId ? activeImage.groups.find(g => g.id === zone.groupId) : null;
                    return (
                      <div key={zone.id} className="flex items-center gap-1.5 p-2 rounded hover:bg-gray-700">
                        <button onClick={() => updateZone(zone.id, { visible: !zone.visible })} className="text-xs">
                          {zone.visible ? '👁️' : '🚫'}
                        </button>
                        <span className="w-2 h-2 rounded" style={{ backgroundColor: category?.color }}></span>
                        {renamingZone === zone.id ? (
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => { updateZone(zone.id, { label: renameValue }); setRenamingZone(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { updateZone(zone.id, { label: renameValue }); setRenamingZone(null); } }}
                            autoFocus
                            className="flex-1 bg-gray-700 text-xs px-1 py-0.5 rounded"
                          />
                        ) : (
                          <span className="text-xs flex-1 truncate">{zone.label}</span>
                        )}
                        {group && <span className="text-[9px] text-purple-300">📁</span>}
                        <button onClick={() => { setRenamingZone(zone.id); setRenameValue(zone.label); }} className="text-[10px] text-gray-400">✎</button>
                        <button onClick={() => deleteZone(zone.id)} className="text-xs text-red-400">✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </aside>

        <main className="flex-1 relative overflow-hidden bg-gray-950">
          {tab === 'canvas' ? (
            !activeImage ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-5xl mb-4">🖼️</div>
                  <p className="text-gray-400">Загрузите изображение</p>
                </div>
              </div>
            ) : (
              <div style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}>
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  onMouseMove={(e) => setMousePos(getCanvasCoords(e))}
                  className="cursor-crosshair"
                />
              </div>
            )
          ) : (
            <div className="p-6 overflow-auto h-full">
              {!activeImage ? (
                <div className="text-center py-20">
                  <div className="text-5xl mb-4 opacity-30">📑</div>
                  <p className="text-gray-500">Загрузите изображение</p>
                </div>
              ) : (
                <div className="max-w-6xl mx-auto space-y-4">
                  <h2 className="text-2xl font-bold">📑 Документация</h2>
                  {activeImage.groups.map(group => {
                    const groupZones = activeImage.zones.filter(z => group.zoneIds.includes(z.id));
                    return (
                      <div key={group.id} className="bg-gray-800 rounded-xl p-4">
                        <h3 className="text-lg font-semibold mb-2">📁 {group.name}</h3>
                        {group.notes && <p className="text-sm text-gray-400 mb-2">{group.notes}</p>}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500">📄 PDF</label>
                            {group.pdfUrl ? (
                              <a href={group.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-red-300 hover:underline block truncate">
                                {group.pdfUrl}
                              </a>
                            ) : <span className="text-xs text-gray-600">Не указана</span>}
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500">📊 Таблица</label>
                            {group.tableUrl ? (
                              <a href={group.tableUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-300 hover:underline block truncate">
                                {group.tableUrl}
                              </a>
                            ) : <span className="text-xs text-gray-600">Не указана</span>}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500">Области ({groupZones.length})</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {groupZones.map(zone => {
                              const category = CATEGORIES.find(c => c.id === zone.category);
                              return (
                                <span key={zone.id} className="flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-xs">
                                  <span className="w-2 h-2 rounded" style={{ backgroundColor: category?.color }}></span>
                                  {zone.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {editingGroup && activeImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-700 flex justify-between">
              <h2 className="text-lg font-semibold">📁 Редактирование группы</h2>
              <button onClick={() => setEditingGroup(null)} className="text-xl">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">Название</label>
                <input
                  type="text"
                  value={editingGroup.name}
                  onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-400 mb-1 block">📄 PDF</label>
                  <input
                    type="url"
                    value={editingGroup.pdfUrl}
                    onChange={(e) => setEditingGroup({ ...editingGroup, pdfUrl: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 mb-1 block">📊 Таблица</label>
                  <input
                    type="url"
                    value={editingGroup.tableUrl}
                    onChange={(e) => setEditingGroup({ ...editingGroup, tableUrl: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">📝 Заметки</label>
                <textarea
                  value={editingGroup.notes}
                  onChange={(e) => setEditingGroup({ ...editingGroup, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-2 block">Области ({editingGroup.zoneIds.length})</label>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto bg-gray-900/50 rounded p-2">
                  {activeImage.zones.map(zone => {
                    const category = CATEGORIES.find(c => c.id === zone.category);
                    const isInGroup = editingGroup.zoneIds.includes(zone.id);
                    return (
                      <button
                        key={zone.id}
                        onClick={() => toggleZoneInGroup(editingGroup.id, zone.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left ${isInGroup ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-gray-800'}`}
                      >
                        <span className={`w-3 h-3 rounded border-2 ${isInGroup ? 'bg-purple-500 border-purple-400' : 'border-gray-600'}`}></span>
                        <span className="w-2 h-2 rounded" style={{ backgroundColor: category?.color }}></span>
                        <span className="flex-1 truncate">{zone.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => setEditingGroup(null)} className="px-4 py-2 bg-gray-700 rounded">Отмена</button>
              <button onClick={() => { updateGroup(editingGroup.id, editingGroup); setEditingGroup(null); }} className="px-4 py-2 bg-blue-600 rounded">Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {exportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-700 flex justify-between">
              <h2 className="text-lg font-semibold">📦 Сохранение проекта</h2>
              <button onClick={() => setExportModal(null)} className="text-xl">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <p className="text-sm text-gray-400 mb-3">Файл: <span className="text-white font-mono">{exportModal.filename}</span></p>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => {
                    const blob = new Blob([exportModal.content], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = exportModal.filename;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 rounded"
                >
                  ⬇️ Скачать
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(exportModal.content);
                    alert('Скопировано!');
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 rounded"
                >
                  📋 Копировать
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-gray-900 rounded p-3">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
                  {exportModal.content.length > 50000 ? exportModal.content.slice(0, 50000) + '\n\n... (обрезано)' : exportModal.content}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button onClick={() => setExportModal(null)} className="px-4 py-2 bg-gray-700 rounded">Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
