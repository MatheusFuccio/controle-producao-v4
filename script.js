const estado = {
  dados: [],
  filtrados: []
};

const elementos = {
  tabela: document.getElementById('tabelaOSs'),
  busca: document.getElementById('busca'),
  filtroStatus: document.getElementById('filtroStatus'),
  filtroPrazo: document.getElementById('filtroPrazo'),
  ordenacao: document.getElementById('ordenacao'),
  totalOss: document.getElementById('totalOss'),
  emProducao: document.getElementById('emProducao'),
  atrasadas: document.getElementById('atrasadas'),
  entregaSemana: document.getElementById('entregaSemana'),
  liberadoFaturamento: document.getElementById('liberadoFaturamento'),
  contadorFiltrado: document.getElementById('contadorFiltrado'),
  dataAtualizacao: document.getElementById('dataAtualizacao'),
  alerta: document.getElementById('alerta'),
  btnLimparFiltros: document.getElementById('btnLimparFiltros'),
  btnExportarCsv: document.getElementById('btnExportarCsv'),
  modal: document.getElementById('modalOS'),
  modalTitulo: document.getElementById('modalTitulo'),
  modalConteudo: document.getElementById('modalConteudo'),
  fecharModal: document.getElementById('fecharModal'),
  // ===== NOVO: PONTO 7 =====
  painelGargalos: document.getElementById('painelGargalos'),
  listaGargalos: document.getElementById('listaGargalos'),
  totalParadas: document.getElementById('totalParadas')
};

iniciar();

async function iniciar(){
  try{
    const resposta = await fetch(`dados.csv?v=${Date.now()}`);
    if(!resposta.ok) throw new Error('Arquivo dados.csv não encontrado');

    const buffer = await resposta.arrayBuffer();
    let texto = new TextDecoder('utf-8').decode(buffer);

    // Remove BOM duplicado ou residual
    texto = texto.replace(/^\uFEFF+/, '');

    // Detecta mojibake (acento duplamente codificado) e corrige
    if(/\u00C3[\u00A0-\u00BF]|\u00C2[\u00A0-\u00BF]/.test(texto)){
      try{
        const bytes = new Uint8Array([...texto].map(c => c.charCodeAt(0)));
        const corrigido = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        texto = corrigido;
      }catch(e){
        // Se não for mojibake recuperável, mantém o original
      }
    }

    if(!texto.trim()) throw new Error('dados.csv está vazio');

    estado.dados = normalizarDados(parseCSV(texto));
    if(!estado.dados.length) throw new Error('Nenhuma OS válida encontrada no CSV');

    preencherFiltroStatus();
    aplicarFiltros();
    elementos.dataAtualizacao.textContent = `Atualizado em ${new Date().toLocaleString('pt-BR')}`;
  }catch(erro){
    elementos.alerta.classList.remove('hidden');
    elementos.alerta.textContent = `Erro ao carregar os dados: ${erro.message}. Confira se dados.csv está na mesma pasta do index.html e use o Live Server.`;
    console.error('Falha no carregamento:', erro);
  }
}

function parseCSV(texto){
  const limpo = texto.replace(/^\uFEFF/, '').trim();
  if(!limpo) return [];

  const linhas = limpo.split(/\r?\n/).filter(Boolean);
  const cabecalhos = separarLinhaCSV(linhas.shift()).map(normalizarCabecalho);

  return linhas.map(linha => {
    const valores = separarLinhaCSV(linha);
    const objeto = {};
    cabecalhos.forEach((chave, i) => {
      objeto[chave] = (valores[i] || '').trim();
    });
    return objeto;
  });
}

function separarLinhaCSV(linha){
  const resultado = [];
  let atual = '';
  let dentroAspas = false;

  for(let i = 0; i < linha.length; i++){
    const caractere = linha[i];

    if(caractere === '"'){
      if(dentroAspas && linha[i + 1] === '"'){
        atual += '"';
        i++;
      }else{
        dentroAspas = !dentroAspas;
      }
      continue;
    }

    if(caractere === ';' && !dentroAspas){
      resultado.push(atual);
      atual = '';
      continue;
    }

    atual += caractere;
  }

  resultado.push(atual);
  return resultado;
}

function normalizarCabecalho(valor){
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizarStatus(valor){
  return String(valor || '')
    .trim()
    .toUpperCase()
    .replace('LIBERADO EXPEDIÇÃO', 'LIBERADO FATURAMENTO')
    .replace('LIBERADO EXPEDICAO', 'LIBERADO FATURAMENTO');
}

function normalizarDados(linhas){
  return linhas.map((linha, indice) => {
    const item = {
      id: indice + 1,
      os: linha.os || linha.op || '',
      cliente: linha.cliente || '',
      produto: linha.produto || linha.equipamento || '',
      qtde: linha.qtde || linha.quantidade || '',
      lancamento: linha.lancamento || linha.entrada || '',
      entrega: linha.entrega || linha.prazo || '',
      status: normalizarStatus(linha.status || 'SEM STATUS'),
      observacao: linha.observacao_da_ultima_reuniao_semanal || linha.observacao || '',
      responsavel: linha.responsavel || '',
      prioridade: linha.prioridade || '',
      valor: linha.valor || '',
      // ===== NOVO: PONTO 6 e 7 =====
      tagParada: String(linha.tag_parada || '').trim().toUpperCase(),
      tagLogistica: String(linha.tag_logistica || '').trim().toUpperCase(),
      historico: parseHistorico(linha.historico)
    };

    item.dataEntrega = converterData(item.entrega);
    item.diasPrazo = calcularDiasPrazo(item.dataEntrega);
    item.situacaoPrazo = definirSituacaoPrazo(item);

    return item;
  });
}

function converterData(valor){
  const texto = String(valor || '').trim();
  if(!texto) return null;

  const partes = texto.split('/');
  if(partes.length !== 3) return null;

  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const ano = Number(partes[2]);

  if(!dia || !mes || !ano) return null;

  const data = new Date(ano, mes - 1, dia);
  return isNaN(data.getTime()) ? null : data;
}

function calcularDiasPrazo(data){
  if(!data) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(data);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

function definirSituacaoPrazo(item){
  if(item.status.includes('CONCLU') || item.status.includes('LIBERADO FATURAMENTO')) return 'CONCLUIDA';

  const dias = calcularDiasPrazo(item.dataEntrega);
  if(dias === null) return 'SEM_DATA';
  if(dias < 0) return 'ATRASADA';
  if(dias <= 7) return '7_DIAS';
  return 'NO_PRAZO';
}

function preencherFiltroStatus(){
  const status = [...new Set(estado.dados.map(item => item.status))].sort();
  elementos.filtroStatus.innerHTML = '<option value="">Todos</option>' +
    status.map(valor => `<option value="${escapeHTML(valor)}">${escapeHTML(formatarStatus(valor))}</option>`).join('');
}

function aplicarFiltros(){
  const termo = elementos.busca.value.trim().toLowerCase();
  const status = elementos.filtroStatus.value;
  const prazo = elementos.filtroPrazo.value;

  estado.filtrados = estado.dados.filter(item => {
    const textoBusca = [item.os, item.cliente, item.produto, item.qtde, item.status, item.observacao, item.responsavel, item.prioridade, item.tagParada, item.tagLogistica]
      .join(' ')
      .toLowerCase();

    const bateBusca = !termo || textoBusca.includes(termo);
    const bateStatus = !status || item.status === status;
    const batePrazo = !prazo || item.situacaoPrazo === prazo;

    return bateBusca && bateStatus && batePrazo;
  });

  ordenarDados();
  atualizarIndicadores();
  renderizarTabela();
  renderizarAlerta();
  renderizarGargalos(); // ===== NOVO: PONTO 7 =====
}

function ordenarDados(){
  const modo = elementos.ordenacao.value;
  estado.filtrados.sort((a,b) => {
    if(modo === 'entrega-desc') return (b.dataEntrega || 0) - (a.dataEntrega || 0);
    if(modo === 'cliente-asc') return a.cliente.localeCompare(b.cliente, 'pt-BR');
    if(modo === 'os-asc') return Number(a.os) - Number(b.os) || String(a.os).localeCompare(String(b.os), 'pt-BR');
    return (a.dataEntrega || new Date(9999,0,1)) - (b.dataEntrega || new Date(9999,0,1));
  });
}

function atualizarIndicadores(){
  const dados = estado.dados;
  elementos.totalOss.textContent = dados.length;
  elementos.emProducao.textContent = dados.filter(x => x.status.includes('PRODU')).length;
  elementos.atrasadas.textContent = dados.filter(x => x.situacaoPrazo === 'ATRASADA').length;
  elementos.entregaSemana.textContent = dados.filter(x => x.situacaoPrazo === '7_DIAS').length;
  elementos.liberadoFaturamento.textContent = dados.filter(x => x.status.includes('LIBERADO FATURAMENTO')).length;
  elementos.contadorFiltrado.textContent = estado.filtrados.length;
}

function renderizarTabela(){
  if(!estado.filtrados.length){
    elementos.tabela.innerHTML = `<tr><td class="empty" colspan="10">Nenhuma OS encontrada para os filtros selecionados.</td></tr>`;
    return;
  }

  elementos.tabela.innerHTML = estado.filtrados.map(item => `
    <tr data-id="${item.id}">
      <td class="os-cell">${escapeHTML(item.os)}</td>
      <td class="cliente-cell">${escapeHTML(item.cliente)}</td>
      <td class="produto-cell">${escapeHTML(item.produto)}</td>
      <td class="qtde-cell">${escapeHTML(item.qtde || '-')}</td>
      <td>${escapeHTML(item.lancamento)}</td>
      <td>${escapeHTML(item.entrega)}</td>
      <td>${badgeStatus(item.status)}</td>
      <td>${badgePrazo(item)}</td>
      <td class="tag-cell">${badgeTag(item)}</td>
      <td class="obs-cell" title="${escapeHTML(item.observacao || '-')}">${escapeHTML(resumirTexto(item.observacao || '-', 58))}</td>
    </tr>
  `).join('');

  elementos.tabela.querySelectorAll('tr[data-id]').forEach(linha => {
    linha.addEventListener('click', () => abrirModal(Number(linha.dataset.id)));
  });
}

function renderizarAlerta(){
  const atrasadas = estado.dados.filter(item => item.situacaoPrazo === 'ATRASADA');
  if(!atrasadas.length){
    elementos.alerta.classList.add('hidden');
    return;
  }

  const destaque = atrasadas.slice(0,3).map(item => `OS ${item.os} (${item.cliente})`).join(', ');
  elementos.alerta.classList.remove('hidden');
  elementos.alerta.textContent = `${atrasadas.length} OS(s) atrasada(s). Priorize a verificação de: ${destaque}${atrasadas.length > 3 ? '...' : '.'}`;
}

function badgeStatus(status){
  let classe = 'badge--default';
  if(status.includes('PRODU')) classe = 'badge--producao';
  if(status.includes('REVIS')) classe = 'badge--revisao';
  if(status.includes('CONCLU') || status.includes('LIBERADO FATURAMENTO')) classe = 'badge--concluido';
  return `<span class="badge ${classe}">${escapeHTML(formatarStatus(status))}</span>`;
}

function badgePrazo(item){
  const situacao = item.situacaoPrazo;
  if(situacao === 'CONCLUIDA') return '<span class="prazo prazo--concluida">Concluída</span>';
  if(situacao === 'ATRASADA') return `<span class="prazo prazo--atrasada">Atrasada ${Math.abs(item.diasPrazo)} dia(s)</span>`;
  if(situacao === '7_DIAS') return `<span class="prazo prazo--semana">${item.diasPrazo === 0 ? 'Vence hoje' : `${item.diasPrazo} dia(s)`}</span>`;
  if(situacao === 'NO_PRAZO') return `<span class="prazo prazo--ok">No prazo</span>`;
  return '<span class="prazo prazo--ok">Sem data</span>';
}

function abrirModal(id){
  const item = estado.dados.find(x => x.id === id);
  if(!item) return;

  elementos.modalTitulo.textContent = `OS ${item.os}`;
  elementos.modalConteudo.innerHTML = `
    <div class="detail-grid">
      <div class="detail"><span>Cliente</span><strong>${escapeHTML(item.cliente)}</strong></div>
      <div class="detail"><span>Status</span><strong>${formatarStatus(item.status)}</strong></div>
      <div class="detail detail--wide"><span>Produto / Serviço</span><strong>${escapeHTML(item.produto)}</strong></div>
      <div class="detail"><span>Quantidade</span><strong>${escapeHTML(item.qtde || 'Não informada')}</strong></div>
      <div class="detail"><span>Lançamento</span><strong>${escapeHTML(item.lancamento || '-')}</strong></div>
      <div class="detail"><span>Entrega</span><strong>${escapeHTML(item.entrega || '-')}</strong></div>
      <div class="detail"><span>Situação do prazo</span><strong>${textoPrazo(item)}</strong></div>
      <div class="detail"><span>Responsável / Setor</span><strong>${escapeHTML(item.responsavel || 'Não informado')}</strong></div>
      <div class="detail"><span>Prioridade</span><strong>${escapeHTML(item.prioridade || 'Não informada')}</strong></div>
      <div class="detail"><span>Valor</span><strong>${escapeHTML(item.valor || 'Não informado')}</strong></div>
      <div class="detail detail--wide"><span>Observação da última reunião semanal</span><strong>${escapeHTML(item.observacao || 'Sem observação')}</strong></div>
      ${renderizarTimeline(item)}
    </div>
  `;
  elementos.modal.showModal();
}

function textoPrazo(item){
  if(item.situacaoPrazo === 'ATRASADA') return `Atrasada ${Math.abs(item.diasPrazo)} dia(s)`;
  if(item.situacaoPrazo === '7_DIAS') return item.diasPrazo === 0 ? 'Vence hoje' : `Entrega em ${item.diasPrazo} dia(s)`;
  if(item.situacaoPrazo === 'NO_PRAZO') return 'No prazo';
  if(item.situacaoPrazo === 'CONCLUIDA') return 'Concluída';
  return 'Sem data válida';
}

function formatarStatus(status){
  return String(status || '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

function resumirTexto(valor, limite){
  const texto = String(valor || '').trim();
  if(texto.length <= limite) return texto;
  return `${texto.slice(0, limite).trim()}...`;
}

function escapeHTML(valor){
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function limparFiltros(){
  elementos.busca.value = '';
  elementos.filtroStatus.value = '';
  elementos.filtroPrazo.value = '';
  elementos.ordenacao.value = 'entrega-asc';
  aplicarFiltros();
}

function exportarCsvFiltrado(){
  const cabecalho = ['OS','CLIENTE','PRODUTO','QTDE','LANCAMENTO','ENTREGA','STATUS','SITUACAO_PRAZO','TAG_PARADA','TAG_LOGISTICA','OBSERVACAO'];
  const linhas = estado.filtrados.map(item => [
    item.os,
    item.cliente,
    item.produto,
    item.qtde,
    item.lancamento,
    item.entrega,
    item.status,
    textoPrazo(item),
    item.tagParada,
    item.tagLogistica,
    item.observacao
  ]);

  const conteudo = [cabecalho, ...linhas]
    .map(linha => linha.map(campo => `"${String(campo).replace(/"/g,'""')}"`).join(';'))
    .join('\n');

  const blob = new Blob([`\uFEFF${conteudo}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pcp-elevolt-filtrado-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// PONTO 6 — HISTÓRICO DE MOVIMENTAÇÃO POR OS
// ============================================================

/**
 * Converte a string do CSV em array de etapas.
 * Formato esperado: "2026-09-18|LANÇAMENTO,2026-10-05|AGUARDANDO MATERIAL"
 */
function parseHistorico(valor){
  const texto = String(valor || '').trim();
  if(!texto) return [];

  return texto.split(',').map(parte => {
    const pedacos = parte.split('|');
    const data = (pedacos.shift() || '').trim();
    const etapa = pedacos.join('|').trim();
    const dataObj = parseDataISO(data);
    if(!dataObj || !etapa) return null;
    return { data: dataObj, etapa: etapa.toUpperCase() };
  }).filter(Boolean).sort((a,b) => a.data - b.data);
}

/** Converte "2026-09-18" em Date local (evita deslocamento de fuso). */
function parseDataISO(valor){
  const m = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Calcula dias em cada etapa e o lead time total.
 * Retorna { etapas: [{etapa, entrada, dias, atual}], total }
 */
function calcularTimeline(item){
  const hist = item.historico || [];
  if(!hist.length) return { etapas: [], total: null };

  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  const etapas = hist.map((h, i) => {
    const proxima = hist[i + 1];
    const fim = proxima ? proxima.data : hoje;
    const dias = Math.max(0, Math.round((fim - h.data) / 86400000));
    return {
      etapa: h.etapa,
      entrada: h.data,
      dias,
      atual: !proxima
    };
  });

  const total = Math.round((hoje - hist[0].data) / 86400000);
  return { etapas, total };
}

/** Formata Date em dd/mm/aaaa. */
function formatarData(data){
  if(!data) return '-';
  return data.toLocaleDateString('pt-BR');
}

/** Renderiza a linha do tempo dentro do modal. */
function renderizarTimeline(item){
  const { etapas, total } = calcularTimeline(item);

  if(!etapas.length){
    return `
      <div class="detail detail--wide">
        <span>Histórico de movimentação</span>
        <strong class="timeline__vazio">
          Sem histórico registrado. Preencha a coluna HISTORICO no dados.csv
          no formato <code>AAAA-MM-DD|ETAPA</code>.
        </strong>
      </div>`;
  }

  const encerradas = etapas.filter(e => !e.atual);
  const maior = encerradas.length ? Math.max(...encerradas.map(e => e.dias)) : 0;

  const itens = etapas.map(e => {
    const destaque = !e.atual && e.dias === maior && maior > 0;
    return `
      <li class="timeline__item ${e.atual ? 'timeline__item--atual' : ''} ${destaque ? 'timeline__item--gargalo' : ''}">
        <span class="timeline__ponto"></span>
        <div class="timeline__conteudo">
          <strong>${escapeHTML(e.etapa)}</strong>
          <small>${formatarData(e.entrada)}</small>
        </div>
        <span class="timeline__dias">
          ${e.dias} dia${e.dias === 1 ? '' : 's'}
          ${e.atual ? '<em>em curso</em>' : ''}
          ${destaque ? '<em>maior permanência</em>' : ''}
        </span>
      </li>`;
  }).join('');

  return `
    <div class="detail detail--wide">
      <span>Histórico de movimentação</span>
      <strong class="timeline__total">
        Lead time total: ${total} dia${total === 1 ? '' : 's'} desde o lançamento
      </strong>
      <ul class="timeline">${itens}</ul>
    </div>`;
}

// ============================================================
// PONTO 7 — TAGS DE GARGALO
// ============================================================

/** Retorna a tag de parada ativa (ignora OS concluídas). */
function tagAtiva(item){
  if(item.status.includes('CONCLU') || item.status.includes('LIBERADO FATURAMENTO')) return '';
  return item.tagParada || '';
}

/** Agrupa as OS abertas por tag de parada e monta o painel. */
function renderizarGargalos(){
  if(!elementos.listaGargalos) return;

  const abertas = estado.dados.filter(item => !item.status.includes('CONCLU') && !item.status.includes('LIBERADO FATURAMENTO'));
  const contagem = {};

  abertas.forEach(item => {
    const tag = tagAtiva(item);
    if(!tag) return;
    if(!contagem[tag]) contagem[tag] = [];
    contagem[tag].push(item);
  });

  const ordenado = Object.entries(contagem).sort((a,b) => b[1].length - a[1].length);
  const semTag = abertas.filter(item => !tagAtiva(item)).length;

  if(elementos.totalParadas){
    elementos.totalParadas.textContent = abertas.length;
  }

  if(!ordenado.length){
    elementos.listaGargalos.innerHTML = `
      <p class="gargalo__vazio">
        Nenhuma OS com tag de parada. Preencha a coluna TAG_PARADA no dados.csv
        para alimentar este indicador.
      </p>`;
    return;
  }

  const maior = ordenado[0][1].length;

  elementos.listaGargalos.innerHTML = ordenado.map(([tag, itens]) => {
    const pct = Math.round((itens.length / abertas.length) * 100);
    const critico = itens.length === maior;
    const oss = itens.map(i => i.os).join(', ');

    return `
      <div class="gargalo ${critico ? 'gargalo--critico' : ''}">
        <div class="gargalo__topo">
          <strong>${escapeHTML(formatarTag(tag))}</strong>
          <span class="gargalo__qtd">${itens.length}</span>
        </div>
        <div class="gargalo__barra">
          <span style="width:${pct}%"></span>
        </div>
        <small class="gargalo__oss">OS: ${escapeHTML(oss)}</small>
      </div>`;
  }).join('') + (semTag ? `
      <div class="gargalo gargalo--neutro">
        <div class="gargalo__topo">
          <strong>Sem tag de parada</strong>
          <span class="gargalo__qtd">${semTag}</span>
        </div>
        <small class="gargalo__oss">OS sem classificação de gargalo</small>
      </div>` : '');
}

/** Transforma AGUARDANDO_MASSA_CRUA em texto legível. */
function formatarTag(tag){
  return String(tag || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, l => l.toUpperCase());
}

/** Badge da tag na tabela. */
function badgeTag(item){
  const tag = tagAtiva(item);
  if(!tag) return '<span class="tag-vazia">—</span>';
  return `<span class="tag tag--parada">${escapeHTML(formatarTag(tag))}</span>`;
}

// ============================================================
// EVENTOS
// ============================================================

elementos.busca.addEventListener('input', aplicarFiltros);
elementos.filtroStatus.addEventListener('change', aplicarFiltros);
elementos.filtroPrazo.addEventListener('change', aplicarFiltros);
elementos.ordenacao.addEventListener('change', aplicarFiltros);
elementos.btnLimparFiltros.addEventListener('click', limparFiltros);
elementos.btnExportarCsv.addEventListener('click', exportarCsvFiltrado);
elementos.fecharModal.addEventListener('click', () => elementos.modal.close());
elementos.modal.addEventListener('click', evento => {
  if(evento.target === elementos.modal) elementos.modal.close();
});