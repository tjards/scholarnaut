/* ScholarNaut | no frontend build dependencies, works locally and as static HTML. */
(() => {
  'use strict';

  // Application state and Document Object Model (DOM) helpers
  const STATIC_MODE = window.ATLAS_MODE === 'static';
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const EMPTY_STATE_HTML = '<h3>Detailed summary.</h3><p>Hover over a publication or select it from the list below to explore.</p>';
  const state = {
    payload: null,
    search: '',
    activeAreas: new Set(),
    minYear: null,
    maxYear: null,
    selectedId: null,
    hoverId: null,
    draftAreas: [],
    sort: 'newest',
    expanded: false,
    view: 'timeline',
    polls: 0,
    pollTimer: null,
    maxCitations: 1,
  };

  // Utility functions for DOM and data manipulation
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (s) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[s]);
  }
  function safeUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    } catch (_err) { /* ignore */ }
    return '';
  }
  function el(name, attributes = {}, text = null) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text != null) node.textContent = String(text);
    return node;
  }
  function append(parent, name, attrs = {}, text = null) {
    const node = el(name, attrs, text);
    parent.appendChild(node);
    return node;
  }
  function colorFor(id) {
    return state.payload?.areas.find((a) => a.id === id)?.color || '#8ea3c5';
  }
  function areaFor(id) {
    return state.payload?.areas.find((a) => a.id === id);
  }
  function getHaloRadius(citations, maxCitations) {
    const minRadius = 5.9;
    const maxRadius = 35.4; // 6x the min (double the previous scale)
    const effectiveMax = Math.max(maxCitations || 1, 10);
    if (effectiveMax === 0) return minRadius;
    const scale = Math.min((citations || 0) / effectiveMax, 1);
    return minRadius + scale * (maxRadius - minRadius);
  }
  function formatDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
  }
  function years() {
    return [...new Set((state.payload?.publications || []).map((p) => p.year).filter(Number.isInteger))].sort((a,b) => a-b);
  }
  function allPapers() { return state.payload?.publications || []; }
  function filteredPapers() {
    const query = state.search.trim().toLowerCase();
    return allPapers().filter((p) => {
      if (state.minYear != null && p.year != null && p.year < state.minYear) return false;
      if (state.maxYear != null && p.year != null && p.year > state.maxYear) return false;
      if (state.activeAreas.size && !p.areas.some((a) => state.activeAreas.has(a))) return false;
      if (!query) return true;
      return [p.title, p.authors, p.venue, p.year, ...p.areas.map((a) => areaFor(a)?.name || '')]
        .join(' ').toLowerCase().includes(query);
    });
  }
  function sortedPapers(papers) {
    return [...papers].sort((a,b) => {
      if (state.sort === 'oldest') return (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title);
      if (state.sort === 'citations') return b.citations - a.citations || (b.year || 0)-(a.year || 0);
      if (state.sort === 'title') return a.title.localeCompare(b.title);
      return (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title);
    });
  }
  function paperById(id) { return allPapers().find((p) => p.id === id); }
  function tagHTML(id, {editable = false, on = true} = {}) {
    const area = areaFor(id);
    if (!area) return '';
    const label = escapeHtml(area.name);
    return editable
      ? `<button class="edit-tag ${on ? 'on' : ''}" type="button" data-edit-area="${escapeHtml(id)}" aria-pressed="${on}" style="--tag-color:${area.color}"><i></i>${label}</button>`
      : `<span class="paper-tag" style="--tag-color:${area.color}"><i></i>${label}</span>`;
  }

  // Rendering functions for UI components
  function initYearControls() {
    const vals = years();
    const from = $('year-from'), to = $('year-to');
    const oldMin = state.minYear, oldMax = state.maxYear;
    const opts = vals.map((yr) => `<option value="${yr}">${yr}</option>`).join('');
    from.innerHTML = `<option value="">All years</option>${opts}`;
    to.innerHTML = `<option value="">All years</option>${opts}`;
    if (vals.includes(oldMin)) from.value = String(oldMin); else state.minYear = null;
    if (vals.includes(oldMax)) to.value = String(oldMax); else state.maxYear = null;
  }
  // Animate number from 0 to target value
  function animateNumber(element, target, duration = 600) {
    let current = 0;
    const increment = target / (duration / 16);
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      element.textContent = Math.round(current);
    }, 16);
  }
  function renderStats() {
    const papers = allPapers();
    $('profile-name').textContent = state.payload.profile_name;
    animateNumber($('count-papers'), papers.length);
    
    // Calculate total citations
    const totalCitations = papers.reduce((sum, p) => sum + (p.citations || 0), 0);
    animateNumber($('count-citations'), totalCitations);
    
    // Calculate h-index
    const citationCounts = papers.map(p => p.citations || 0).sort((a, b) => b - a);
    let hIndex = 0;
    for (let i = 0; i < citationCounts.length; i++) {
      if (citationCounts[i] >= i + 1) {
        hIndex = i + 1;
      } else {
        break;
      }
    }
    animateNumber($('count-h-index'), hIndex);
    
    const link = safeUrl(state.payload.profile_url);
    if (link) {
      if ($('scholar-nav-link')) $('scholar-nav-link').href = link;
      if ($('footer-scholar')) $('footer-scholar').href = link;
    }
    document.title = `${state.payload.profile_name} · ScholarNaut`;
  }
  // Render sync status bar with profile info and refresh state
  function renderStatus() {
    const p = state.payload;
    if (!p) return;
    const box = $('sync-status'), title = $('sync-title'), description = $('sync-description'), refresh = $('refresh-btn');
    box.classList.toggle('is-error', !!p.status.error);
    const snapshotDate = formatDate(p.fetched_at);
    $('last-fetched').textContent = snapshotDate ? `Synced ${snapshotDate}` : '';
    if (STATIC_MODE) {
      title.textContent = 'Published Google Scholar snapshot';
      description.textContent = `Snapshot date${snapshotDate ? ` · ${snapshotDate}` : ''}.`;
      refresh.textContent = 'Static';
      refresh.disabled = true;
    } else if (p.status.refreshing) {
      title.textContent = 'Refreshing cached publications…';
      description.textContent = 'Fetching public profile. Cached profile still available.';
      refresh.textContent = '↻ Refreshing…';
      refresh.disabled = true;
    } else if (p.status.error) {
      title.textContent = 'Cached publications · Scholar unavailable';
      description.textContent = p.status.error;
      refresh.textContent = p.status.cooldown_seconds > 0 ? `Retry in ${Math.ceil(p.status.cooldown_seconds)}s` : '↻ Retry Scholar';
      refresh.disabled = false;
    } else {
      title.textContent = 'Google Scholar profile synced';
      description.textContent = `Retrieved from public profile on ${formatDate(p.fetched_at)}`;
      refresh.textContent = p.status.cooldown_seconds > 0 ? `Retry in ${Math.ceil(p.status.cooldown_seconds)}s` : '↻ Refresh';
      refresh.disabled = false;
    }
    $('export-link').href = STATIC_MODE ? './data/publications.json' : '/api/export';
    $('export-link').style.opacity = '1';
    $('export-link').title = 'Download publication metadata';
  }
  // Area filter management
  function renderAreaFilters() {
    const container = $('area-filters');
    const areas = state.payload?.areas || [];
    const hasAnyFilter = state.activeAreas.size > 0;
    
    container.innerHTML = areas.map((a) => {
      const isActive = state.activeAreas.has(a.id);
      return `<button class="filter-chip ${isActive ? 'active' : ''} ${hasAnyFilter && !isActive ? 'faded' : ''}" type="button" data-filter="${escapeHtml(a.id)}" aria-pressed="${isActive}"><span class="chip-dot" style="--chip-color:${a.color}"></span>${escapeHtml(a.name)}</button>`;
    }).join('');
  }
  // Toggle area filter on/off
  function activateFilter(id) {
    if (id === 'all') state.activeAreas.clear();
    else if (state.activeAreas.has(id)) state.activeAreas.delete(id);
    else state.activeAreas.add(id);
    state.expanded = false;
    renderAll();
  }

  // Render main diagram with papers, flows, and area filters
  function renderTimeline() {
    const svg = $('atlas-svg');
    svg.replaceChildren();
    const areas = state.payload.areas;
    const papers = filteredPapers().filter((p) => Number.isInteger(p.year));
    const vals = years();
    $('visible-count').textContent = `${papers.length} of ${allPapers().length} publications`;
    const W = 1050, L = 100, R = 1015, Y0 = 40, rowGap = 55;
    const height = Math.max(350, 50 + rowGap * areas.length);
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    svg.setAttribute('aria-label', `${papers.length} publications between ${vals[0] || 'unknown'} and ${vals.at(-1) || 'unknown'}, grouped into ${areas.length} research areas`);
    if (!vals.length) {
      append(svg, 'text', {x:W/2, y:180, fill:'#a9bdd6', 'text-anchor':'middle'}, 'No publications to display');
      return;
    }
    const lo = vals[0] - (vals.length === 1 ? 1 : 0.5);
    const hi = vals.at(-1) + (vals.length === 1 ? 1 : 0.5);
    const xScale = (year) => L + ((year - lo) / (hi - lo)) * (R - L);
    const yScale = (index) => Y0 + index * rowGap;
    const span = vals.at(-1) - vals[0];
    const tickStep = span > 22 ? 5 : span > 13 ? 3 : span > 8 ? 2 : 1;
    for (let year = vals[0]; year <= vals.at(-1); year++) {
      if ((year - vals[0]) % tickStep !== 0 && year !== vals.at(-1)) continue;
      const x = xScale(year);
      append(svg, 'line', {x1:x, x2:x, y1:Y0-18, y2:yScale(areas.length-1)+36, class:'grid-line'});
      append(svg, 'text', {x, y:yScale(areas.length-1)+53, class:'year-label','text-anchor':'middle'}, year);
    }
    append(svg, 'line', {x1:18,x2:R,y1:height-18,y2:height-18,stroke:'#34516d','stroke-opacity':'.28'});

    // Position papers centrally in a timeline, with connections flowing to research areas
    const centerY = yScale(areas.length / 2 - 0.5);
    const paperPositions = new Map();
    const groupedByYear = new Map();
    
    papers.forEach((p) => {
      if (!groupedByYear.has(p.year)) groupedByYear.set(p.year, []);
      groupedByYear.get(p.year).push(p);
    });
    
    for (const [year, group] of groupedByYear.entries()) {
      group.sort((a,b) => a.id.localeCompare(b.id));
      const yearX = xScale(year);
      const groupHeight = Math.min(group.length * 16, 120); // spread papers vertically
      const startY = centerY - groupHeight / 2;
      
      group.forEach((p, index) => {
        const offsetY = group.length > 1 ? (index / (group.length - 1)) * groupHeight : 0;
        paperPositions.set(p.id, {x: yearX, y: startY + offsetY});
      });
    }
    
    const focusedId = state.hoverId || state.selectedId;
    
    // Draw Sankey-style flowing ribbons from research areas through papers
    papers.forEach((p) => {
      const paperPos = paperPositions.get(p.id);
      if (!paperPos || p.areas.length === 0) return;
      
      const highlighted = p.id === focusedId;
      
      p.areas.forEach((areaId) => {
        const areaIndex = areas.findIndex(a => a.id === areaId);
        if (areaIndex === -1) return;
        
        const area = areas[areaIndex];
        const areaY = yScale(areaIndex);
        
        // Sankey-style flowing ribbon from area lane to paper
        const startX = L + 30;  // Start from area lane
        const endX = paperPos.x;
        const startY = areaY;
        const endY = paperPos.y;
        
        // If something is selected: highlight selected lines, fade others
        let opacity, strokeWidth;
        if (focusedId) {
          if (highlighted) {
            opacity = '.5';
            strokeWidth = 6.5;
          } else {
            opacity = '.06';
            strokeWidth = 1.5;
          }
        } else {
          // No selection: default to subtle styling
          opacity = '.18';
          strokeWidth = 2.5;
        }
        
        // Cubic bezier curve for smooth flow
        const cp1X = startX + (endX - startX) * 0.3;
        const cp1Y = startY;
        const cp2X = startX + (endX - startX) * 0.7;
        const cp2Y = endY;
        
        const path = `M${startX},${startY} C${cp1X},${cp1Y} ${cp2X},${cp2Y} ${endX},${endY}`;
        
        append(svg,'path',{
          d:path,
          class:'flow-curve',
          'data-paper':p.id,
          stroke:area.color,
          'stroke-opacity':opacity,
          'stroke-width':strokeWidth,
          fill:'none',
          'stroke-linecap':'round',
          'stroke-linejoin':'round',
        });
      });
    });
    // Render papers as central dots with colored background circles
    papers.forEach((p) => {
      const at = paperPositions.get(p.id);
      if (!at) return;
      
      const focused = p.id === focusedId;
      // Only use citation-based scaling when something is selected; otherwise use default size
      const haloRadius = focusedId ? getHaloRadius(p.citations, state.maxCitations) : 5.9;
      const primaryAreaId = p.areas[0];
      const primaryColor = primaryAreaId ? colorFor(primaryAreaId) : '#999';
      
      // Apply opacity based on focus state
      let dotOpacity, shadeOpacity;
      if (focusedId) {
        if (focused) {
          dotOpacity = '.84';
          shadeOpacity = '.35';
        } else {
          dotOpacity = '.10';
          shadeOpacity = '.05';
        }
      } else {
        dotOpacity = '.84';
        shadeOpacity = '.35';
      }
      
      // Scaled colored background circle based on citations (only when selected)
      append(svg,'circle',{cx:at.x,cy:at.y,r:haloRadius,fill:primaryColor,'fill-opacity':shadeOpacity,class:'node-bg'});
      // Focus halo
      if (focused) append(svg,'circle',{cx:at.x,cy:at.y,r:11.9,fill:primaryColor,'fill-opacity':'.12'});
      // Fixed white circle on top
      const circle = append(svg,'circle',{cx:at.x,cy:at.y,r:5.9,fill:primaryColor,'fill-opacity':dotOpacity,class:'node','aria-label':`${p.title}, ${p.year}`,tabindex:0,role:'button'});
      const hit = append(svg,'circle',{cx:at.x,cy:at.y,r:12,class:'node-hit','aria-label':`View ${p.title}`,tabindex:0,role:'button'});
      const show = (event) => { state.hoverId=p.id; renderDetails(); showTooltip(p,event); highlightFocusedNodes(p.id); };
      hit.addEventListener('mouseenter',show);
      hit.addEventListener('mousemove',(event)=>moveTooltip(event));
      hit.addEventListener('mouseleave',()=>{state.hoverId=null;hideTooltip();renderDetails();highlightFocusedNodes(state.selectedId);});
      hit.addEventListener('click',()=>{state.selectedId=p.id;state.hoverId=null;state.draftAreas=[...p.areas];hideTooltip();renderAll();});
      hit.addEventListener('keydown',(event)=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();state.selectedId=p.id;state.hoverId=null;state.draftAreas=[...p.areas];hideTooltip();renderAll();}
      });
      circle.setAttribute('pointer-events','none');
    });
    if (!papers.length) append(svg,'text',{x:640,y:height/2,'text-anchor':'middle',fill:'#aec5d9','font-size':14},'No papers match these filters.');
  }
  // Tooltip and node highlighting
  function highlightFocusedNodes(id) {
    const svg = $('atlas-svg');
    if (!id) {
      svg.querySelectorAll('.node').forEach((n)=>n.setAttribute('r','5.9'));
      return;
    }
    const item = paperById(id);
    if(!item) return;
    svg.querySelectorAll('.node-hit').forEach((hit)=>{
      const active=hit.getAttribute('aria-label')===`View ${item.title}`;
      const dot=hit.previousElementSibling;
      if(dot&&dot.classList.contains('node'))dot.setAttribute('r', active?'7':'5.9');
    });
  }
  function showTooltip(p,event){
    const box=$('chart-tooltip');
    box.innerHTML=`<div class="tooltip-label">${escapeHtml(p.year || 'UNDATED')} · PUBLICATION</div><strong>${escapeHtml(p.title)}</strong><p>${escapeHtml(p.venue||p.authors||'Select to view more')}</p>`;
    box.hidden=false;
    moveTooltip(event);
  }
  function moveTooltip(event){
    const box=$('chart-tooltip'),container=$('graph-container');
    if(box.hidden||!event||!event.clientX)return;
    const rect=container.getBoundingClientRect();
    let x=event.clientX-rect.left+12+container.scrollLeft;
    if(x>container.clientWidth+container.scrollLeft-252)x-=264;
    const y=Math.max(8,event.clientY-rect.top-85);
    box.style.left=`${Math.max(8,x)}px`;
    box.style.top=`${y}px`;
  }
  function hideTooltip(){ $('chart-tooltip').hidden=true; }

  // Render selected publication details panel
  function renderDetails(){
    const p=paperById(state.hoverId||state.selectedId);
    $('pin-indicator').textContent=state.hoverId&&state.hoverId!==state.selectedId?'PREVIEW':state.selectedId?'PINNED PUBLICATION':'SELECT A DOT';
    if(!p){$('paper-details').innerHTML=EMPTY_STATE_HTML;return;}
    const saved=state.selectedId===p.id;
    const authors=escapeHtml(p.authors||'Authors unavailable'),venue=escapeHtml(p.venue||'Venue not listed');
    const url=safeUrl(p.url);
    $('paper-details').innerHTML=`
      <span class="inspector-year">${escapeHtml(p.year||'YEAR UNKNOWN')}</span>
      <h3 class="inspector-title">${escapeHtml(p.title)}</h3>
      <p class="paper-meta">${authors}<br>${venue}</p>
      <div class="detail-divider"></div>
      <div class="detail-heading">RESEARCH AREA(S)</div>
      <div class="tag-list">${p.areas.map((id)=>tagHTML(id)).join('')||'<span class="paper-meta">No research area label</span>'}</div>
      <div class="detail-divider"></div>
      <div class="detail-heading">ABOUT</div>
      <p class="paper-meta">${saved?'Publication selected.': 'Click the dot to view details.'} ${p.citations||0} citations.</p>
      <div class="detail-actions">${url?`<a class="primary-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Go to publication <span>↗</span></a>`:'<span class="paper-meta">No external link available</span>'}</div>`;
  }
  // Save area assignments to backend
  async function saveAreas(){
    if(STATIC_MODE||!state.selectedId)return;
    const message=$('save-message');
    if(message)message.textContent='Saving…';
    try{
      const response=await fetch('/api/areas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paper_id:state.selectedId,areas:state.draftAreas})});
      if(!response.ok)throw new Error((await response.json()).detail||`HTTP ${response.status}`);
      const paper=paperById(state.selectedId);
      if(paper)paper.areas=[...state.draftAreas];
      state.hoverId=null;
      renderAll();
      const done=$('save-message');if(done)done.textContent='Classification saved to data/overrides.json';
    }catch(error){if(message)message.textContent=`Could not save: ${error.message}`;}
  }
  // Render publication list with pagination
  function renderList(){
    const papers=sortedPapers(filteredPapers());
    const shown=state.expanded?papers:papers.slice(0,8);
    const list=$('paper-list');
    if(!papers.length){list.innerHTML='<div class="no-results"><strong>No publications found</strong>Try clearing search or filters above.</div>';}else{
      list.innerHTML=shown.map((p)=>`<button class="paper-item ${state.selectedId===p.id?'is-selected':''}" type="button" data-paper="${escapeHtml(p.id)}" aria-label="Open details for ${escapeHtml(p.title)}"><span class="paper-year">${escapeHtml(p.year||'—')}</span><span class="paper-content"><h3>${escapeHtml(p.title)}</h3><div class="paper-byline">${escapeHtml(p.authors||'Unknown authors')} ${p.venue?'· '+escapeHtml(p.venue):''}</div><span class="tag-list">${p.areas.map((id)=>tagHTML(id)).join('')}</span></span><span class="paper-arrow">↗</span></button>`).join('');
    }
    $('list-summary').textContent=`Showing ${shown.length} of ${papers.length} matching publications`;
    $('show-more').hidden=shown.length>=papers.length;
    $('show-more').textContent=`Show ${Math.min(papers.length-shown.length, 20)} more publications ↓`;
  }
  // Orchestrate all render functions
  function renderAll(){
    if(!state.payload)return;
    renderStats();renderStatus();renderAreaFilters();renderTimeline();renderDetails();renderList();
    $('timeline-view').classList.toggle('active',state.view==='timeline');
    $('catalog-view').classList.toggle('active',state.view==='catalog');
    $('timeline-view').setAttribute('aria-pressed',String(state.view==='timeline'));
    $('catalog-view').setAttribute('aria-pressed',String(state.view==='catalog'));
    $('timeline-panel').style.display=state.view==='timeline'?'':'none';
    $('inspector').style.display=state.view==='timeline'?'':'none';
    $('clear-filters').style.opacity=state.search||state.activeAreas.size||state.minYear||state.maxYear?'1':'.55';
  }
  // Data loading and initialization
  function loadPayload(payload){
    if(!payload||!Array.isArray(payload.publications)||!Array.isArray(payload.areas))throw new Error('Unexpected publication data.');
    state.payload=payload;
    state.maxCitations = Math.max(...payload.publications.map((p) => p.citations || 0), 1);
    
    // Extract and display Scholar ID from profile URL
    if (payload.profile_url) {
      const match = payload.profile_url.match(/user=([^&]+)/);
      if (match) {
        $('scholar-id-input').placeholder = match[1];
      }
    }
    
    initYearControls();renderAll();
  }
  async function loadData(){
    const url=STATIC_MODE?'./data/publications.json':'/api/publications';
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`Could not load ${url} (HTTP ${response.status})`);
    const payload=await response.json();
    loadPayload(payload);
    if(!STATIC_MODE){
      if(payload.status.refreshing){
        state.polls++;
        if(state.polls<24){clearTimeout(state.pollTimer);state.pollTimer=setTimeout(()=>loadData().catch(showFatal),2000);}
      }else{
        // Refresh complete, stop polling
        clearTimeout(state.pollTimer);
        state.polls=0;
      }
    }
  }
  function showFatal(error){
    $('sync-title').textContent='Unable to load publication data';
    $('sync-description').textContent=String(error?.message||error);
    $('sync-status').classList.add('is-error');
    $('refresh-btn').disabled=false;
  }

  // Search and suggestions
  function getSearchSuggestions(query) {
    if (!query || query.length < 2) return [];
    
    const papers = allPapers();
    const lowerQuery = query.toLowerCase();
    const suggestions = new Map(); // Use Map to deduplicate and track type/value
    
    // Add the typed query as the first suggestion
    suggestions.set(`typed|${query}`, {type: 'Search for', value: query});
    
    papers.forEach(p => {
      // Check titles
      if (p.title && p.title.toLowerCase().includes(lowerQuery)) {
        const key = `title|${p.title}`;
        if (!suggestions.has(key)) suggestions.set(key, {type: 'Title', value: p.title});
      }
      
      // Check authors - split by comma and check each author individually
      if (p.authors) {
        const authorList = p.authors.split(',').map(a => a.trim());
        const matchingAuthors = authorList.filter(a => a.toLowerCase().includes(lowerQuery));
        if (matchingAuthors.length > 0) {
          const key = `author|${p.authors}`;
          if (!suggestions.has(key)) suggestions.set(key, {type: 'Author', value: p.authors});
        }
      }
      
      // Check venues
      if (p.venue && p.venue.toLowerCase().includes(lowerQuery)) {
        const key = `venue|${p.venue}`;
        if (!suggestions.has(key)) suggestions.set(key, {type: 'Venue', value: p.venue});
      }
    });
    
    return Array.from(suggestions.values()).slice(0, 4);
  }
  
  function renderSearchSuggestions(suggestions) {
    const suggestionsBox = $('search-suggestions');
    if (!suggestions || suggestions.length === 0) {
      suggestionsBox.innerHTML = '';
      suggestionsBox.hidden = true;
      return;
    }
    
    suggestionsBox.innerHTML = suggestions.map((s, idx) => 
      `<div class="suggestion-item" data-suggestion="${escapeHtml(s.value)}" role="option">
        <span class="suggestion-label">${s.type}</span>
        ${escapeHtml(s.value.length > 50 ? s.value.substring(0, 47) + '…' : s.value)}
      </div>`
    ).join('');
    suggestionsBox.hidden = false;
  }

  // Event listeners for user interactions
  $('search').addEventListener('input',(event)=>{
    const query = event.target.value;
    state.search = query;
    state.expanded = false;
    
    // Show suggestions
    if (query.length >= 2) {
      const suggestions = getSearchSuggestions(query);
      renderSearchSuggestions(suggestions);
    } else {
      $('search-suggestions').innerHTML = '';
      $('search-suggestions').hidden = true;
    }
    
    renderAll();
  });
  
  $('search-suggestions').addEventListener('click', (event) => {
    const item = event.target.closest('.suggestion-item');
    if (!item) return;
    const value = item.dataset.suggestion;
    $('search').value = value;
    state.search = value;
    state.expanded = false;
    $('search-suggestions').innerHTML = '';
    $('search-suggestions').hidden = true;
    renderAll();
  });
  
  // Hide suggestions when clicking outside
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-wrap')) {
      $('search-suggestions').hidden = true;
    }
  });
  $('sort-by').addEventListener('change',(event)=>{state.sort=event.target.value;renderList();});
  $('year-from').addEventListener('change',(event)=>{state.minYear=event.target.value?Number(event.target.value):null;renderAll();});
  $('year-to').addEventListener('change',(event)=>{state.maxYear=event.target.value?Number(event.target.value):null;renderAll();});
  $('clear-filters').addEventListener('click',()=>{
    state.search='';state.minYear=null;state.maxYear=null;state.activeAreas.clear();state.expanded=false;
    $('search').value='';$('year-from').value='';$('year-to').value='';renderAll();
  });
  $('area-filters').addEventListener('click',(event)=>{const button=event.target.closest('[data-filter]');if(button)activateFilter(button.dataset.filter);});
  $('paper-list').addEventListener('click',(event)=>{
    const button=event.target.closest('[data-paper]');if(!button)return;
    const p=paperById(button.dataset.paper);if(!p)return;
    state.selectedId=p.id;state.hoverId=null;state.draftAreas=[...p.areas];state.view='timeline';renderAll();
    $('atlas').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('show-more').addEventListener('click',()=>{state.expanded=true;renderList();});
  $('refresh-btn').addEventListener('click',async()=>{
    if(STATIC_MODE)return;
    $('refresh-btn').disabled=true;
    try{
      const response=await fetch('/api/refresh',{method:'POST'});
      if(!response.ok)throw new Error((await response.json()).message||'Please retry later.');
      state.polls=0;await loadData();
    }catch(error){$('sync-description').textContent=error.message;setTimeout(()=>loadData().catch(showFatal),1500);}
  });
  
  $('scholar-id-btn').addEventListener('click',async()=>{
    const scholarId = $('scholar-id-input').value.trim();
    if (!scholarId) return;
    if (STATIC_MODE) {
      $('sync-description').textContent = 'Cannot change Scholar profile in static mode.';
      return;
    }
    $('scholar-id-btn').disabled = true;
    try {
      const response = await fetch('/api/set-scholar-id', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({scholar_id: scholarId})});
      if (!response.ok) throw new Error((await response.json()).message || 'Invalid Scholar ID');
      state.polls = 0;
      await loadData();
    } catch (error) {
      $('sync-description').textContent = error.message;
      setTimeout(() => loadData().catch(showFatal), 1500);
    } finally {
      $('scholar-id-btn').disabled = false;
    }
  });

  // Disable Load button in static mode
  if (STATIC_MODE) {
    $('scholar-id-btn').disabled = true;
  }
  
  $('scholar-id-input').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      $('scholar-id-btn').click();
    }
  });
  $('timeline-view').addEventListener('click',()=>{state.view='timeline';renderAll();});
  $('catalog-view').addEventListener('click',()=>{state.view='catalog';state.expanded=true;renderAll();$('publications').scrollIntoView({behavior:'smooth',block:'start'});});
  if (!STATIC_MODE) setInterval(() => {
    if(state.payload && !state.payload.status.refreshing && state.payload.status.cooldown_seconds > 0) {
      state.payload.status.cooldown_seconds = Math.max(0, state.payload.status.cooldown_seconds - 60);
      renderStatus();
    }
  }, 60000);
  loadData().catch(showFatal);
})();
