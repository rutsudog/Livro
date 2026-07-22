/* ===================== ESTADO E PERSISTÊNCIA ===================== */

const STORAGE_KEY_CONTAS = 'lr_contas';
const STORAGE_KEY_LANCAMENTOS = 'lr_lancamentos';

const CATEGORIAS_PADRAO = [
  'alimentação', 'transporte', 'moradia', 'saúde', 'educação',
  'lazer', 'compras', 'assinaturas', 'contas fixas', 'viagem', 'outros'
];

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function carregarContas(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY_CONTAS)) || []; }
  catch(e){ return []; }
}
function salvarContas(contas){
  localStorage.setItem(STORAGE_KEY_CONTAS, JSON.stringify(contas));
}
function carregarLancamentos(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY_LANCAMENTOS)) || []; }
  catch(e){ return []; }
}
function salvarLancamentos(lancs){
  localStorage.setItem(STORAGE_KEY_LANCAMENTOS, JSON.stringify(lancs));
}

let contas = carregarContas();
let lancamentos = carregarLancamentos();

/* ===================== HELPERS ===================== */

function formatarMoeda(valor){
  const sinal = valor < 0 ? '-' : '';
  return sinal + 'R$ ' + Math.abs(valor).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function hojeISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

function somarMeses(dataISO, n){
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const d = new Date(ano, mes - 1 + n, dia);
  // ajusta caso o mês de destino tenha menos dias (ex.: dia 31 em fevereiro)
  if (d.getDate() !== dia) d.setDate(0);
  return d.toISOString().slice(0,10);
}

/**
 * Expande um lançamento em "eventos" (uma parcela = um evento).
 * Cada evento tem: data, valor (já com sinal +/-), contaId, parcelaLabel.
 */
function eventosDoLancamento(l){
  const sinal = l.tipo === 'gasto' ? -1 : 1;
  if (l.credito && l.parcelas > 1){
    const eventos = [];
    const valorBase = Math.floor((l.valor / l.parcelas) * 100) / 100;
    const resto = Math.round((l.valor - valorBase * l.parcelas) * 100) / 100;
    for (let i = 0; i < l.parcelas; i++){
      const valorParcela = i === l.parcelas - 1 ? valorBase + resto : valorBase;
      eventos.push({
        data: somarMeses(l.data, i),
        valor: sinal * valorParcela,
        contaId: l.contaId,
        parcelaLabel: `${i+1}/${l.parcelas}`,
        parcelaIndex: i+1,
        parcelaTotal: l.parcelas,
        lancamentoId: l.id
      });
    }
    return eventos;
  }
  return [{
    data: l.data,
    valor: sinal * l.valor,
    contaId: l.contaId,
    parcelaLabel: null,
    lancamentoId: l.id
  }];
}

function todosEventos(){
  return lancamentos.flatMap(eventosDoLancamento);
}

function saldoAtualConta(contaId){
  const conta = contas.find(c => c.id === contaId);
  if (!conta) return 0;
  const hoje = hojeISO();
  const eventos = todosEventos().filter(e => e.contaId === contaId && e.data <= hoje);
  const soma = eventos.reduce((acc, e) => acc + e.valor, 0);
  return conta.saldoInicial + soma;
}

/* ===================== RENDER: CONTAS ===================== */

function renderContas(){
  const grid = document.getElementById('contasGrid');
  const selectConta = document.getElementById('fConta');
  grid.innerHTML = '';
  selectConta.innerHTML = '';

  if (contas.length === 0){
    grid.innerHTML = '<p class="contas-vazio">Nenhuma conta cadastrada ainda. Clique em "+ nova conta" para começar.</p>';
  }

  contas.forEach(conta => {
    const saldo = saldoAtualConta(conta.id);
    const card = document.createElement('div');
    card.className = 'conta-card';
    card.innerHTML = `
      <p class="conta-nome">
        <span>${escapeHtml(conta.nome)}</span>
        <button class="conta-remover" data-id="${conta.id}" title="Remover conta">remover</button>
      </p>
      <div class="conta-saldo ${saldo < 0 ? 'negativo' : ''}">${formatarMoeda(saldo)}</div>
      <div class="conta-editar-saldo">
        <input type="number" step="0.01" placeholder="ajustar saldo inicial" data-id="${conta.id}" class="input-saldo-inicial" value="${conta.saldoInicial}">
      </div>
    `;
    grid.appendChild(card);

    const opt = document.createElement('option');
    opt.value = conta.id;
    opt.textContent = conta.nome;
    selectConta.appendChild(opt);
  });

  grid.querySelectorAll('.conta-remover').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const temLancamentos = lancamentos.some(l => l.contaId === id);
      const msg = temLancamentos
        ? 'Essa conta tem lançamentos associados. Remover mesmo assim? Os lançamentos continuarão no histórico, mas sem conta vinculada.'
        : 'Remover esta conta?';
      if (confirm(msg)){
        contas = contas.filter(c => c.id !== id);
        salvarContas(contas);
        renderTudo();
      }
    });
  });

  grid.querySelectorAll('.input-saldo-inicial').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.id;
      const novoValor = parseFloat(input.value);
      if (isNaN(novoValor)) return;
      const conta = contas.find(c => c.id === id);
      if (conta){
        conta.saldoInicial = novoValor;
        salvarContas(contas);
        renderContas();
      }
    });
  });
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ===================== MODAL NOVA CONTA ===================== */

const modalConta = document.getElementById('modalConta');
document.getElementById('btnNovaConta').addEventListener('click', () => {
  document.getElementById('mContaNome').value = '';
  document.getElementById('mContaSaldo').value = '';
  modalConta.hidden = false;
  document.getElementById('mContaNome').focus();
});
document.getElementById('mContaCancelar').addEventListener('click', () => modalConta.hidden = true);
modalConta.addEventListener('click', (e) => { if (e.target === modalConta) modalConta.hidden = true; });

document.getElementById('mContaSalvar').addEventListener('click', () => {
  const nome = document.getElementById('mContaNome').value.trim();
  const saldo = parseFloat(document.getElementById('mContaSaldo').value) || 0;
  if (!nome){ alert('Dê um nome para a conta.'); return; }
  contas.push({ id: uid(), nome, saldoInicial: saldo });
  salvarContas(contas);
  modalConta.hidden = true;
  renderTudo();
});

/* ===================== FORM DE LANÇAMENTO ===================== */

const formLancamento = document.getElementById('formLancamento');
let tipoAtual = 'gasto';

document.querySelectorAll('.tipo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tipo-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked','false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-checked','true');
    tipoAtual = btn.dataset.tipo;
    const creditoField = document.getElementById('creditoField');
    creditoField.style.display = tipoAtual === 'gasto' ? 'flex' : 'none';
    if (tipoAtual !== 'gasto'){
      document.getElementById('fCredito').checked = false;
      document.getElementById('parcelasQtdWrap').hidden = true;
    }
    atualizarPreviaParcelas();
  });
});

document.getElementById('fCredito').addEventListener('change', (e) => {
  document.getElementById('parcelasQtdWrap').hidden = !e.target.checked;
  atualizarPreviaParcelas();
});
document.getElementById('fParcelas').addEventListener('input', atualizarPreviaParcelas);
document.getElementById('fValor').addEventListener('input', atualizarPreviaParcelas);

function atualizarPreviaParcelas(){
  const preview = document.getElementById('parcelaPreview');
  const credito = document.getElementById('fCredito').checked;
  const valor = parseFloat(document.getElementById('fValor').value) || 0;
  const parcelas = parseInt(document.getElementById('fParcelas').value) || 1;
  if (credito && parcelas > 1 && valor > 0){
    const valorParcela = valor / parcelas;
    preview.textContent = `${parcelas}x de ${formatarMoeda(valorParcela)}`;
  } else {
    preview.textContent = '';
  }
}

function popularCategorias(){
  const datalist = document.getElementById('listaCategorias');
  const usadas = new Set(lancamentos.map(l => l.categoria.toLowerCase()));
  const todas = new Set([...CATEGORIAS_PADRAO, ...usadas]);
  datalist.innerHTML = '';
  todas.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    datalist.appendChild(opt);
  });
}

document.getElementById('fData').value = hojeISO();

formLancamento.addEventListener('submit', (e) => {
  e.preventDefault();

  if (contas.length === 0){
    alert('Cadastre ao menos uma conta antes de lançar um gasto ou ganho.');
    return;
  }

  const valor = parseFloat(document.getElementById('fValor').value);
  const data = document.getElementById('fData').value;
  const descricao = document.getElementById('fDescricao').value.trim();
  const categoria = document.getElementById('fCategoria').value.trim().toLowerCase();
  const contaId = document.getElementById('fConta').value;
  const credito = tipoAtual === 'gasto' && document.getElementById('fCredito').checked;
  const parcelas = credito ? (parseInt(document.getElementById('fParcelas').value) || 2) : 1;

  if (!valor || valor <= 0 || !data || !descricao || !categoria || !contaId){
    alert('Preencha todos os campos obrigatórios.');
    return;
  }

  lancamentos.push({
    id: uid(),
    tipo: tipoAtual,
    valor, data, descricao, categoria, contaId,
    credito, parcelas
  });
  salvarLancamentos(lancamentos);

  formLancamento.reset();
  document.getElementById('fData').value = hojeISO();
  document.getElementById('parcelasQtdWrap').hidden = true;
  document.getElementById('parcelaPreview').textContent = '';

  renderTudo();
});

/* ===================== GRÁFICO DE CATEGORIAS ===================== */

let chartInstance = null;
const PALETA_GRAFICO = ['#9C3D2E','#B3492B','#C9773F','#3A6351','#2B4C7E','#5B5748','#8C8672','#6E4A3A','#4E6A5A','#7A5C2E'];

function renderGrafico(){
  const periodo = document.getElementById('filtroPeriodo').value;
  const hoje = hojeISO();
  const [anoAtual, mesAtual] = hoje.split('-');

  const gastos = lancamentos.filter(l => {
    if (l.tipo !== 'gasto') return false;
    if (periodo === 'mes'){
      const [ano, mes] = l.data.split('-');
      return ano === anoAtual && mes === mesAtual;
    }
    return true;
  });

  const totaisPorCategoria = {};
  gastos.forEach(l => {
    totaisPorCategoria[l.categoria] = (totaisPorCategoria[l.categoria] || 0) + l.valor;
  });

  const categorias = Object.keys(totaisPorCategoria).sort((a,b) => totaisPorCategoria[b]-totaisPorCategoria[a]);
  const valores = categorias.map(c => totaisPorCategoria[c]);
  const total = valores.reduce((a,b)=>a+b, 0);

  document.getElementById('graficoTotalValor').textContent = formatarMoeda(total);

  const legenda = document.getElementById('legendaCategorias');
  legenda.innerHTML = '';
  if (categorias.length === 0){
    legenda.innerHTML = '<li class="legenda-vazio">Nenhum gasto registrado neste período.</li>';
  } else {
    categorias.forEach((cat, i) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="legenda-swatch" style="background:${PALETA_GRAFICO[i % PALETA_GRAFICO.length]}"></span>
        <span class="legenda-nome">${escapeHtml(cat)}</span>
        <span class="legenda-valor">${formatarMoeda(totaisPorCategoria[cat])}</span>
      `;
      legenda.appendChild(li);
    });
  }

  const ctx = document.getElementById('chartCategorias').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categorias,
      datasets: [{
        data: valores,
        backgroundColor: categorias.map((_, i) => PALETA_GRAFICO[i % PALETA_GRAFICO.length]),
        borderColor: '#FBF9F3',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatarMoeda(ctx.parsed)}`
          }
        }
      }
    }
  });
}

document.getElementById('filtroPeriodo').addEventListener('change', renderGrafico);

/* ===================== PARCELAS EM ABERTO ===================== */

function renderParcelas(){
  const container = document.getElementById('parcelasLista');
  const hoje = hojeISO();

  const abertas = todosEventos()
    .filter(e => e.parcelaLabel && e.data > hoje)
    .sort((a,b) => a.data.localeCompare(b.data));

  container.innerHTML = '';
  if (abertas.length === 0){
    container.innerHTML = '<p class="parcelas-vazio">Nenhuma parcela futura em aberto.</p>';
    return;
  }

  abertas.forEach(ev => {
    const lanc = lancamentos.find(l => l.id === ev.lancamentoId);
    const conta = contas.find(c => c.id === ev.contaId);
    const div = document.createElement('div');
    div.className = 'parcela-item';
    div.innerHTML = `
      <div>
        <div class="parcela-desc">${escapeHtml(lanc ? lanc.descricao : '')}</div>
        <div class="parcela-meta">${formatarDataBR(ev.data)} · ${conta ? escapeHtml(conta.nome) : 'conta removida'} · parcela ${ev.parcelaLabel}</div>
      </div>
      <div class="parcela-valor">${formatarMoeda(Math.abs(ev.valor))}</div>
    `;
    container.appendChild(div);
  });
}

function formatarDataBR(iso){
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/* ===================== HISTÓRICO ===================== */

function renderHistorico(){
  const corpo = document.getElementById('corpoHistorico');
  const vazio = document.getElementById('historicoVazio');
  const busca = document.getElementById('buscaHistorico').value.trim().toLowerCase();

  corpo.innerHTML = '';

  const eventos = todosEventos()
    .map(ev => {
      const lanc = lancamentos.find(l => l.id === ev.lancamentoId);
      return { ...ev, lanc };
    })
    .filter(ev => ev.lanc)
    .filter(ev => {
      if (!busca) return true;
      return ev.lanc.descricao.toLowerCase().includes(busca) || ev.lanc.categoria.toLowerCase().includes(busca);
    })
    .sort((a,b) => b.data.localeCompare(a.data));

  vazio.hidden = eventos.length > 0;

  eventos.forEach(ev => {
    const conta = contas.find(c => c.id === ev.contaId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatarDataBR(ev.data)}</td>
      <td>${escapeHtml(ev.lanc.descricao)}</td>
      <td>${escapeHtml(ev.lanc.categoria)}</td>
      <td>${conta ? escapeHtml(conta.nome) : '—'}</td>
      <td>${ev.parcelaLabel ? `<span class="tag-parcela">${ev.parcelaLabel}</span>` : '—'}</td>
      <td class="valor-cel ${ev.valor < 0 ? 'gasto' : 'ganho'}">${formatarMoeda(ev.valor)}</td>
      <td><button class="btn-excluir" data-id="${ev.lanc.id}" title="Excluir lançamento inteiro">excluir</button></td>
    `;
    corpo.appendChild(tr);
  });

  corpo.querySelectorAll('.btn-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (confirm('Excluir este lançamento (todas as parcelas, se houver)?')){
        lancamentos = lancamentos.filter(l => l.id !== id);
        salvarLancamentos(lancamentos);
        renderTudo();
      }
    });
  });
}

document.getElementById('buscaHistorico').addEventListener('input', renderHistorico);

/* ===================== EXPORTAÇÃO / IMPORTAÇÃO ===================== */

function baixarArquivo(conteudo, nomeArquivo, tipo){
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('btnExportCsv').addEventListener('click', () => {
  const linhas = [['Data','Descrição','Categoria','Conta','Tipo','Valor total','Parcela','Valor da parcela']];
  lancamentos
    .slice()
    .sort((a,b) => a.data.localeCompare(b.data))
    .forEach(l => {
      const conta = contas.find(c => c.id === l.contaId);
      const eventos = eventosDoLancamento(l);
      eventos.forEach(ev => {
        linhas.push([
          formatarDataBR(ev.data),
          l.descricao,
          l.categoria,
          conta ? conta.nome : '',
          l.tipo,
          l.valor.toFixed(2).replace('.',','),
          ev.parcelaLabel || '1/1',
          Math.abs(ev.valor).toFixed(2).replace('.',',')
        ]);
      });
    });
  const csv = linhas.map(l => l.map(campo => `"${String(campo).replace(/"/g,'""')}"`).join(';')).join('\n');
  baixarArquivo('\uFEFF' + csv, `gastos_${hojeISO()}.csv`, 'text/csv;charset=utf-8');
});

document.getElementById('btnExportJson').addEventListener('click', () => {
  const backup = { contas, lancamentos, exportadoEm: new Date().toISOString() };
  baixarArquivo(JSON.stringify(backup, null, 2), `backup_livro_razao_${hojeISO()}.json`, 'application/json');
});

document.getElementById('inputImport').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const dados = JSON.parse(reader.result);
      if (!Array.isArray(dados.contas) || !Array.isArray(dados.lancamentos)){
        throw new Error('formato inválido');
      }
      const modo = confirm('Escolha OK para SUBSTITUIR todos os dados atuais pelo backup, ou Cancelar para MESCLAR com os dados existentes.');
      if (modo){
        contas = dados.contas;
        lancamentos = dados.lancamentos;
      } else {
        const idsContasExistentes = new Set(contas.map(c => c.id));
        dados.contas.forEach(c => { if (!idsContasExistentes.has(c.id)) contas.push(c); });
        const idsLancExistentes = new Set(lancamentos.map(l => l.id));
        dados.lancamentos.forEach(l => { if (!idsLancExistentes.has(l.id)) lancamentos.push(l); });
      }
      salvarContas(contas);
      salvarLancamentos(lancamentos);
      renderTudo();
      alert('Backup importado com sucesso.');
    } catch(err){
      alert('Não foi possível ler este arquivo. Verifique se é um backup válido gerado por este sistema.');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* ===================== RENDER GERAL ===================== */

function renderTudo(){
  renderContas();
  popularCategorias();
  renderGrafico();
  renderParcelas();
  renderHistorico();
}

renderTudo();
