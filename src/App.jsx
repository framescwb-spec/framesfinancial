import { useState, useMemo, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { jsPDF } from "jspdf";
const uid = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ── Firebase (dados salvos na nuvem — mesmo projeto "frames-system") ──
const firebaseConfig = {
  apiKey: "AIzaSyCLpFlkp4vwKG4TUwqnaCAF-z3YqXa-4s8",
  authDomain: "frames-system.firebaseapp.com",
  projectId: "frames-system",
  storageBucket: "frames-system.firebasestorage.app",
  messagingSenderId: "488046203697",
  appId: "1:488046203697:web:2f3ddda7b333d96c6c5610",
};
const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
// IMPORTANTE: o banco de dados Firestore deste projeto NÃO se chama "(default)" —
// ele foi criado com o nome "financial". É preciso passar esse nome explicitamente,
// senão o SDK tenta conectar num banco que não existe e as escritas ficam
// travadas para sempre sem nunca dar erro nem sucesso.
const db = getFirestore(firebaseApp, "financial");
const auth = getAuth(firebaseApp);
// Cada usuário logado tem seu PRÓPRIO documento, identificado pelo UID
// (identificador único) da conta dele no Firebase Authentication — assim
// os dados de uma pessoa/empresa nunca se misturam com os de outra.
let currentUid = null;
function getDocRef() {
  if (!currentUid) throw new Error("Usuário não autenticado ainda.");
  return doc(db, "produtora", currentUid);
}

const ROLES = ["Diretor","Cinegrafista","Editor","Motion","Fotógrafo","Produtor","Assistente","Drone","Áudio","Outro"];
const EXPENSE_TYPES = ["Logística","Alimentação","Uber","Voo","Hotel/Airbnb","Estacionamento","Gasolina","Gastos extras","Outro"];
const PAYMENT_SOURCES = ["Cartão Frames","Cartão Japa","Cartão Ivan","Dinheiro","Pix/Transferência"];
const CATEGORIES_EXPENSE = ["Equipamento","Software","Marketing","Pessoal","Aluguel","Transporte","Estacionamento","Outros"];
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const REIMB_SOURCES = ["Frames","Ivan","Japa"];

const formatBRL = (v) => Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const today = () => new Date().toISOString().split("T")[0];
const AVATAR_COLORS = ["#818cf8","#fb923c","#f472b6","#34d399","#22d3ee","#facc15","#4D7CFE","#f87171","#4ade80","#38bdf8"];
const getColor = (idx) => AVATAR_COLORS[Math.abs(idx) % AVATAR_COLORS.length];
const SOURCE_COLOR = {"Cartão Frames":"#facc15","Cartão Japa":"#22d3ee","Cartão Ivan":"#f472b6","Dinheiro":"#34d399","Pix/Transferência":"#818cf8"};
const TYPE_ICON = {"Logística":"🚛","Alimentação":"🍽️","Uber":"🚗","Voo":"✈️","Hotel/Airbnb":"🏨","Estacionamento":"🅿️","Gasolina":"⛽","Gastos extras":"💳","Outro":"📦"};
const monthKey = (d) => d ? d.slice(0,7) : null;
const monthLabel = (key) => { if(!key) return "—"; const [y,m]=key.split("-"); return `${MONTHS_PT[parseInt(m)-1]}/${y}`; };

// ── Default data ──
// CLIENTS: empresas/pessoas que contratam. JOBS: projetos/trabalhos que pertencem a um cliente.
const DEFAULT_CLIENTS = [];

const DEFAULT_JOBS = [];

const DEFAULT_REIMBURSEMENTS = [];

const DEFAULT_FREELANCERS = [];

// Caches & ProjectExpenses now reference jobId instead of project name
const DEFAULT_CACHES = [];

const DEFAULT_PROJ_EXPENSES = [];

const DEFAULT_STUDIO_EXPENSES = [];
const DEFAULT_SUBSCRIPTIONS = [];
const STUDIO_CATEGORIES = ["Aluguel","Internet","Energia","Água","Condomínio","Limpeza","Manutenção","Segurança","Outros"];
const SUB_CATEGORIES = ["Design","Edição","IA","Cloud/Storage","Música","Hospedagem","Comunicação","Contabilidade","Outros"];
const BILLING_CYCLES = ["mensal","anual"];

const JOB_STATUS = ["negociação","fechado","em produção","entregue","faturado","recebido"];
const JOB_STATUS_COLOR = {"negociação":"#64748b","fechado":"#818cf8","em produção":"#f59e0b","entregue":"#22d3ee","faturado":"#fb923c","recebido":"#22c55e"};
const confirmDelete = (msg) => window.confirm(`⚠️ ${msg}\n\nEssa ação não pode ser desfeita.`);
const PAYMENT_METHODS = ["Pix/Transferência","Dinheiro","Cartão Frames","Cartão Japa","Cartão Ivan"];
const REIMBURSEMENT_TYPES = ["Adiantamento profissional","Fatura cartão","Outro"];
const OLD_STORAGE_KEY = "produtora-data-v1";

// Migrates old flat structure (receivables w/ project name as string) into new Client -> Job hierarchy.
function migrateOldData(old, defaults) {
  // Build clients from unique project names seen in old.receivables (fallback to defaults if none)
  const clients = defaults.clients.map(c => ({...c}));
  const clientByName = {};
  clients.forEach(c => { clientByName[c.name.toLowerCase()] = c.id; });

  let nextClientId = Math.max(0, ...clients.map(c=>c.id)) + 1;
  let nextJobId = Math.max(0, ...defaults.jobs.map(j=>j.id)) + 1;

  const jobs = [];
  const jobIdByDesc = {}; // old project-name string -> new job id

  (old.receivables || []).forEach(r => {
    const key = (r.desc||"").toLowerCase();
    let clientId = clientByName[key];
    if (!clientId) {
      // create a new client for this name if not matched
      clientId = nextClientId++;
      clients.push({id: clientId, name: r.desc});
      clientByName[key] = clientId;
    }
    // try to reuse a default job id matching this desc, so cache/expense links via jobId in DEFAULT_* still work
    const matchingDefaultJob = defaults.jobs.find(j => j.desc.toLowerCase() === key);
    const jobId = matchingDefaultJob ? matchingDefaultJob.id : nextJobId++;
    jobIdByDesc[key] = jobId;
    jobs.push({
      id: jobId,
      clientId,
      desc: r.desc,
      value: Number(r.value)||0,
      valorRecebido: Number(r.valorRecebido||0),
      nfRate: (old.nfRates && old.nfRates[r.desc] !== undefined) ? old.nfRates[r.desc] : 0.12,
      dateWork: r.dateWork||"",
      datePay: r.datePay||"",
      status: r.status||"pendente",
    });
  });

  const caches = (old.caches || []).map(c => ({
    ...c,
    jobId: jobIdByDesc[(c.project||"").toLowerCase()] ?? null,
  })).filter(c => c.jobId !== null);

  const projectExpenses = (old.projectExpenses || []).map(e => ({
    ...e,
    jobId: jobIdByDesc[(e.project||"").toLowerCase()] ?? null,
  })).filter(e => e.jobId !== null);

  return {
    expenses: old.expenses || [],
    clients,
    jobs,
    reimbursements: old.reimbursements || defaults.reimbursements,
    freelancers: old.freelancers || defaults.freelancers,
    caches,
    projectExpenses,
  };
}

let lastSavedHash = null;
let onStorageError = null; // set by the App component so errors can be shown on screen

// Wraps a promise so it never hangs forever — rejects after `ms` if it hasn't
// settled yet. This protects against silent network blocks (ad blockers,
// privacy extensions, firewalls) that can leave a Firestore call pending
// indefinitely without ever resolving or throwing.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Tempo esgotado (${label}). Verifique sua conexão ou bloqueadores de anúncio/rastreamento que podem estar bloqueando o Firebase.`)), ms)),
  ]);
}
function hashData(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return hash;
}

async function loadFromStorage(defaults) {
  try {
    const snap = await withTimeout(getDoc(getDocRef()), 10000, "carregar dados");
    if (snap.exists()) {
      const saved = snap.data();
      lastSavedHash = hashData(saved);
      return {
        expenses: saved.expenses ?? [],
        clients: saved.clients ?? [],
        jobs: saved.jobs ?? [],
        reimbursements: saved.reimbursements ?? [],
        freelancers: saved.freelancers ?? [],
        caches: saved.caches ?? [],
        projectExpenses: saved.projectExpenses ?? [],
        studioExpenses: saved.studioExpenses ?? [],
        subscriptions: saved.subscriptions ?? [],
        demands: saved.demands ?? [],
        accommodations: saved.accommodations ?? [],
        _isExistingDoc: true,
      };
    }
  } catch(e) { console.error("Erro ao carregar do Firebase:", e); if(onStorageError) onStorageError(`Erro ao CARREGAR: ${e.code||e.message||e}`); }

  // No cloud data found — try migrating from the legacy artifact export (window.storage),
  // if the person imported it via localStorage, so nothing already edited is lost.
  try {
    const legacyRaw = window.localStorage.getItem("framesbr-legacy-import");
    if (legacyRaw) {
      const old = JSON.parse(legacyRaw);
      const migrated = migrateOldData(old, defaults);
      await saveToStorage(migrated);
      window.localStorage.removeItem("framesbr-legacy-import");
      return {...migrated, _isExistingDoc: true};
    }
  } catch(e) { console.error("Erro na migração de dados antigos:", e); }

  // Conta nova (documento ainda não existe no Firestore): começa TUDO vazio,
  // sem os dados de exemplo do código. Cada nova produtora monta seu sistema do zero.
  return {
    expenses: [], clients: [], jobs: [], reimbursements: [],
    freelancers: [], caches: [], projectExpenses: [],
    studioExpenses: [], subscriptions: [], accommodations: [], demands: [],
    _isNewAccount: true,
  };
}

async function saveToStorage(data) {
  try {
    const newHash = hashData(data);
    if (newHash === lastSavedHash) return true; // nothing changed, already saved
    await withTimeout(setDoc(getDocRef(), data, { merge: false }), 10000, "salvar dados");
    lastSavedHash = newHash;
    if(onStorageError) onStorageError(null);
    return true;
  } catch(e) {
    console.error("Erro ao salvar no Firebase:", e);
    if(onStorageError) onStorageError(`Erro ao SALVAR: ${e.code||e.message||e}`);
    return false;
  }
}

function AppContent({ onLogout, userEmail }) {
  const [loaded, setLoaded] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [syncStatus, setSyncStatus] = useState("ok"); // "ok" | "offline"
  const [syncNotice, setSyncNotice] = useState(false);
  useEffect(() => { onStorageError = (msg) => setSaveError(msg); return () => { onStorageError = null; }; }, []);

  const [tab, setTab] = useState("dashboard");
  const [dashSubTab, setDashSubTab] = useState("geral");
  const [selectedClient, setSelectedClient] = useState(null); // client id
  const [selectedJob, setSelectedJob] = useState(null); // job id
  const [jobSubTab, setJobSubTab] = useState("equipe");
  const [showAddClient, setShowAddClient] = useState(false);
  const [draggedClientId, setDraggedClientId] = useState(null);
  const [expandedFLId, setExpandedFLId] = useState(null);
  const [changeLog, setChangeLog] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [meta, setMeta] = useState({value:"", period:"mensal"});
  const [showMeta, setShowMeta] = useState(false);
  const logChange = (desc) => setChangeLog(p=>[{desc,time:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),date:new Date().toLocaleDateString("pt-BR")}, ...p].slice(0,30));
  const [dragOverClientId, setDragOverClientId] = useState(null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [showAddFL, setShowAddFL] = useState(false);
  const [showNewFLForm, setShowNewFLForm] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const [expenses, setExpenses] = useState([]);
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const [freelancers, setFreelancers] = useState([]);
  const [caches, setCaches] = useState([]);
  const [projectExpenses, setProjectExpenses] = useState([]);
  const [studioExpenses, setStudioExpenses] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [demands, setDemands] = useState([]);

  const applyLoadedData = (data) => {
    // Conta nova: aplica exatamente o que veio (tudo vazio), sem misturar com
    // os dados de exemplo do código nem rodar correções de dados legados.
    if (data._isNewAccount) {
      setExpenses([]); setClients([]); setJobs([]); setReimbursements([]);
      setFreelancers([]); setCaches([]); setProjectExpenses([]);
      setStudioExpenses([]); setSubscriptions([]); setDemands([]);
      return;
    }

    setExpenses((data.expenses||[]).map(e => ({
      source: e.source ?? PAYMENT_SOURCES[0],
      paymentType: e.paymentType ?? "à vista",
      parcelas: e.parcelas ?? "1",
      parcelasPagas: e.parcelasPagas ?? (e.status==="pago" ? (e.parcelas ?? "1") : "0"),
      ...e,
    })));

    // Correções pontuais de dados legados da conta original (Cruzeiro do Sul / GINGA→CWB).
    // Só rodam se esses registros específicos existirem nos dados salvos — em qualquer
    // outra conta simplesmente não fazem nada. NÃO injetam dados de exemplo.
    let mergedClients = [...data.clients];
    let mergedJobs = [...data.jobs];
    const cruzeiroDupes = mergedClients.filter(c => c.name === "Cruzeiro do Sul");
    if (cruzeiroDupes.length > 1) {
      const canonical = cruzeiroDupes.reduce((a,b) => a.id < b.id ? a : b);
      const dupeIds = cruzeiroDupes.filter(c => c.id !== canonical.id).map(c => c.id);
      mergedJobs = mergedJobs.map(j => dupeIds.includes(j.clientId) ? {...j, clientId: canonical.id} : j);
      mergedClients = mergedClients.filter(c => !dupeIds.includes(c.id));
    }
    const cwbClient = mergedClients.find(c => c.name === "CWB Brasil");
    if (cwbClient) {
      mergedJobs = mergedJobs.map(j => (j.id === 106 || (j.desc === "GINGA" && j.clientId === 6)) ? {...j, clientId: cwbClient.id} : j);
    }

    setClients(mergedClients);

    // ── Migração de estrutura de campos (segura para todas as contas) ──
    mergedJobs = mergedJobs.map(j => {
      const m = {...j};
      if (m.datePay !== undefined && m.dateDueExpected === undefined) {
        m.dateDueExpected = m.datePay || "";
        delete m.datePay;
      }
      if (m.dateDelivery === undefined) m.dateDelivery = "";
      if (m.dateInvoice === undefined) m.dateInvoice = "";
      if (m.dateReceived === undefined) m.dateReceived = "";
      if (!Array.isArray(m.payments)) m.payments = [];
      // Se já há um valor em valorRecebido mas payments[] ainda está vazio,
      // cria um registro de pagamento retroativo para unificar os dois sistemas.
      if (m.payments.length === 0 && Number(m.valorRecebido||0) > 0) {
        m.payments = [{id: uid(), value: Number(m.valorRecebido), date: m.dateReceived || today(), note: "Migrado"}];
      }
      if (!Array.isArray(m.workDates)) m.workDates = m.dateWork ? [m.dateWork] : [];
      if (m.produtoraRate === undefined) m.produtoraRate = 0;
      if (m.status === "pendente") m.status = "fechado";
      return m;
    });
    setJobs(mergedJobs);

    setReimbursements(data.reimbursements);

    setFreelancers([...data.freelancers]);

    let mergedCaches = [...data.caches];
    mergedCaches = mergedCaches.map(c => {
      const m = {...c};
      if (m.datePay !== undefined && m.dateDue === undefined) {
        m.dateDue = m.datePay || "";
        delete m.datePay;
      }
      if (m.datePaid === undefined) m.datePaid = "";
      if (!Array.isArray(m.workDates)) m.workDates = m.dateWork ? [m.dateWork] : [];
      return m;
    });
    setCaches(mergedCaches);

    let mergedProjExp = [...data.projectExpenses].map(e => e.dateFim === undefined ? {...e, dateFim: ""} : e);
    // Migração: a antiga aba separada "Hotel/Airbnb" (accommodations) foi unificada
    // dentro de "Despesas do Job" como um tipo de despesa. Qualquer hospedagem
    // salva no formato antigo vira uma despesa comum, sem perder nenhum dado.
    const legacyAccommodations = Array.isArray(data.accommodations) ? data.accommodations : [];
    if (legacyAccommodations.length > 0) {
      const migrated = legacyAccommodations.map(a => ({
        id: a.id, jobId: a.jobId, type: "Hotel/Airbnb",
        desc: a.nome || a.tipo || "", link: a.link || "", hospedes: a.hospedes || "",
        value: Number(a.value || 0), source: a.source || PAYMENT_SOURCES[0],
        paymentType: "à vista", parcelas: "1",
        dateWork: a.checkIn || "", dateFim: a.checkOut || "", datePay: "",
        status: a.status || "a pagar",
      }));
      const existingIds = new Set(mergedProjExp.map(e => e.id));
      mergedProjExp = [...mergedProjExp, ...migrated.filter(e => !existingIds.has(e.id))];
    }
    setProjectExpenses(mergedProjExp);

    setStudioExpenses((Array.isArray(data.studioExpenses) ? data.studioExpenses : []).map(e => {
      if (e.monthly && typeof e.monthly === "object") return e;
      // Migração: despesa antiga tinha só um valor fixo. Semeia o histórico mensal
      // com esse valor no mês atual, para não perder a informação existente.
      const mk = today().slice(0,7);
      return { ...e, monthly: e.value ? { [mk]: Number(e.value) } : {} };
    }));
    setSubscriptions(Array.isArray(data.subscriptions) ? data.subscriptions : []);
    setDemands(Array.isArray(data.demands) ? data.demands : []);
  };

  useEffect(() => {
    let unsubscribe = null;

    loadFromStorage({
      expenses: [], clients: DEFAULT_CLIENTS, jobs: DEFAULT_JOBS,
      reimbursements: DEFAULT_REIMBURSEMENTS, freelancers: DEFAULT_FREELANCERS,
      caches: DEFAULT_CACHES, projectExpenses: DEFAULT_PROJ_EXPENSES,
    }).then(data => {
      applyLoadedData(data);
      setLoaded(true);
      let isFirstSnapshot = true;

      // ── Sincronização em tempo real entre dispositivos ──
      // A partir daqui, qualquer alteração salva por ESTE ou por QUALQUER OUTRO
      // dispositivo logado na mesma conta chega automaticamente aqui e atualiza
      // a tela. Isso evita que dois computadores abertos ao mesmo tempo apaguem
      // as mudanças um do outro — cada um sempre trabalha em cima da versão mais
      // recente, não de uma cópia desatualizada guardada só na memória local.
      try {
        unsubscribe = onSnapshot(getDocRef(), (snap) => {
          if (!snap.exists()) return;
          // Ignora a própria escrita otimista local ainda não confirmada pelo
          // servidor — ela já está refletida na tela, reprocessar de novo não
          // muda nada e só gastaria tempo.
          if (snap.metadata.hasPendingWrites) return;
          // Se o usuário acabou de fazer uma alteração local que ainda não
          // terminou de salvar, NÃO aplica os dados remotos agora — isso
          // evitaria sobrescrever a mudança recém-feita com uma versão antiga
          // vinda do servidor. O próprio salvamento local vai atualizar o
          // servidor em instantes, e a sincronização volta a valer depois disso.
          if (hasPendingLocalChanges.current) return;
          const saved = snap.data();
          lastSavedHash = hashData(saved); // evita que o auto-save regrave o que acabou de chegar
          applyLoadedData(saved);
          setSyncStatus("ok");
          if (!isFirstSnapshot) {
            setSyncNotice(true);
            setTimeout(() => setSyncNotice(false), 2500);
          }
          isFirstSnapshot = false;
        }, (err) => {
          console.error("Erro na sincronização em tempo real:", err);
          setSyncStatus("offline");
        });
      } catch (e) {
        console.error("Não foi possível iniciar sincronização em tempo real:", e);
        setSyncStatus("offline");
      }
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const saveTimer = useRef(null);
  // Trava que impede a sincronização em tempo real de sobrescrever alterações
  // locais que ainda não terminaram de ser salvas — evita que um cliente/job
  // recém-adicionado "suma" da tela por causa de uma atualização remota
  // desatualizada chegando no meio do caminho.
  const hasPendingLocalChanges = useRef(false);
  const [isSavingNow, setIsSavingNow] = useState(false);

  const exportPdfSummary = () => {
    const docPdf = new jsPDF();
    const pageWidth = docPdf.internal.pageSize.getWidth();
    let y = 20;

    const addTitle = (text) => { docPdf.setFontSize(16); docPdf.setFont(undefined,"bold"); docPdf.text(text, 14, y); y += 8; };
    const addSubtitle = (text) => { docPdf.setFontSize(11); docPdf.setFont(undefined,"normal"); docPdf.setTextColor(100); docPdf.text(text, 14, y); docPdf.setTextColor(0); y += 8; };
    const addSectionHeader = (text) => { y += 4; docPdf.setFontSize(13); docPdf.setFont(undefined,"bold"); docPdf.text(text, 14, y); y += 7; docPdf.setLineWidth(0.3); docPdf.line(14, y-4, pageWidth-14, y-4); };
    const addLine = (label, value, indent=0) => {
      if (y > 275) { docPdf.addPage(); y = 20; }
      docPdf.setFontSize(10); docPdf.setFont(undefined,"normal");
      docPdf.text(String(label), 14+indent, y);
      docPdf.setFont(undefined,"bold");
      docPdf.text(String(value), pageWidth-14, y, { align: "right" });
      y += 6;
    };

    addTitle("FRAMES/BR — Financial System");
    addSubtitle(`Resumo gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`);

    addSectionHeader("Balanço Geral");
    addLine("Saldo Atual", formatBRL(totals.balance));
    addLine("Projetado Líquido (após NF)", formatBRL(totals.projected));
    addLine("Total contratado (bruto)", formatBRL(totals.totalReceivables));
    addLine("Já recebido", formatBRL(totals.received));
    addLine("Cachês a pagar", formatBRL(totals.cachesAPagar));
    addLine("Custo fixo mensal (estúdio + assinaturas)", formatBRL(totals.totalFixedMonthly));

    addSectionHeader("Ranking de Clientes (por valor contratado)");
    const rankedClients = clients.map(cl=>({cl,ct:clientTotals(cl.id)})).filter(({ct})=>ct.jobCount>0).sort((a,b)=>b.ct.totalValue-a.ct.totalValue);
    if (rankedClients.length===0) addLine("Nenhum job lançado ainda.", "");
    rankedClients.forEach(({cl,ct},i)=> addLine(`${i+1}. ${cl.name} (${ct.jobCount} job${ct.jobCount>1?"s":""})`, formatBRL(ct.totalValue)));

    addSectionHeader("Ranking de Profissionais (por cachê recebido)");
    const rankedFL = freelancers.map(fl=>{
      const fc=caches.filter(c=>c.freelancerId===fl.id);
      const total=fc.reduce((s,c)=>s+cacheTotal(c),0);
      return {fl,total,jobs:fc.length};
    }).filter(({total})=>total>0).sort((a,b)=>b.total-a.total);
    if (rankedFL.length===0) addLine("Nenhum cachê lançado ainda.", "");
    rankedFL.forEach(({fl,total,jobs},i)=> addLine(`${i+1}. ${fl.apelido||fl.name} (${jobs} job${jobs>1?"s":""})`, formatBRL(total)));

    addSectionHeader("Vencimentos nos próximos 30 dias");
    if (upcomingPayments.length===0) addLine("Nenhum vencimento nos próximos 30 dias.", "");
    upcomingPayments.forEach(item => addLine(`${item.tipo}: ${item.desc} — ${item.datePay}`, formatBRL(item.value)));

    docPdf.save(`framesbr-resumo-${today()}.pdf`);
    logChange("Resumo PDF exportado");
  };

  const saveNow = async () => {
    setIsSavingNow(true);
    const ok = await saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions, demands });
    hasPendingLocalChanges.current = false;
    setIsSavingNow(false);
    if (ok) {
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    }
  };

  useEffect(() => {
    if (!loaded) return;
    hasPendingLocalChanges.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions, demands });
      hasPendingLocalChanges.current = false;
      if (ok) {
        setSavedIndicator(true);
        setTimeout(() => setSavedIndicator(false), 2000);
      }
    }, 1200);
  }, [expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions, demands, loaded]);

  // Force an immediate save if the person closes the tab, refreshes, or switches
  // away before the debounce timer above has fired — prevents losing the last
  // edit made right before navigating away.
  useEffect(() => {
    if (!loaded) return;
    const flush = () => {
      clearTimeout(saveTimer.current);
      saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions, demands });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions, demands, loaded]);

  const emptyE = {desc:"",value:"",category:"Outros",jobId:"",natureza:"overhead",source:PAYMENT_SOURCES[0],paymentType:"à vista",parcelas:"1",parcelasPagas:"0",dateWork:today(),datePay:"",status:"a pagar"};
  const emptyStudio = {desc:"",value:"",category:STUDIO_CATEGORIES[0],dayOfMonth:"5",dateStart:today(),active:true,monthly:{}};
  const emptySub = {desc:"",value:"",category:SUB_CATEGORIES[0],cycle:"mensal",dayOfMonth:"1",dateStart:today(),active:true};
  const DEMAND_STATUS = ["a fazer","fazendo","feito"];
  const DEMAND_PRIORITY = {"alta":"#ef4444","média":"#f59e0b","baixa":"#22c55e"};
  const emptyDemand = {desc:"",responsavelId:"",jobId:"",prazo:"",prioridade:"média",status:"a fazer",notes:""};
  const emptyClient = {name:""};
  const emptyJob = {desc:"",value:"",valorRecebido:"0",nfRate:0.12,produtoraRate:"",dateWork:today(),workDates:[],dateDelivery:"",dateInvoice:"",dateDueExpected:"",dateReceived:"",payments:[],status:"negociação",notes:"",contrato:""};
  const emptyReim = {pessoa:"",desc:"",value:"",tipo:"Adiantamento profissional",devolvidoPara:"Frames",datePay:"",status:"pendente"};
  const emptyFL = {name:"",apelido:"",role:ROLES[0],phone:"",email:"",cpf:"",rg:"",nasc:""};
  const emptyCache = {freelancerId:"",role:ROLES[0],desc:"",value:"",alimentacao:"",logistica:"",dateWork:today(),workDates:[],dateDue:"",datePaid:"",paymentMethod:"Pix/Transferência",status:"a pagar"};
  const emptyProjExp = {type:EXPENSE_TYPES[0],desc:"",value:"",source:PAYMENT_SOURCES[0],paymentType:"à vista",parcelas:"2",dateWork:today(),dateFim:"",datePay:"",link:"",hospedes:"",status:"a pagar"};

  const [formE, setFormE] = useState(emptyE);
  const [formClient, setFormClient] = useState(emptyClient);
  const [formJob, setFormJob] = useState(emptyJob);
  const [formReim, setFormReim] = useState(emptyReim);
  const [formFL, setFormFL] = useState(emptyFL);
  const [formCache, setFormCache] = useState(emptyCache);
  const [formProjExp, setFormProjExp] = useState(emptyProjExp);
  const [formStudio, setFormStudio] = useState(emptyStudio);
  const [formSub, setFormSub] = useState(emptySub);
  const [formDemand, setFormDemand] = useState(emptyDemand);
  const [showAddDemand, setShowAddDemand] = useState(false);
  const [showAddStudio, setShowAddStudio] = useState(false);
  const [expandedStudio, setExpandedStudio] = useState(null);
  const [rankScope, setRankScope] = useState("geral"); // geral | mensal
  const [rankMonth, setRankMonth] = useState(today().slice(0,7));
  const [newMonthKey, setNewMonthKey] = useState(today().slice(0,7));
  const [newMonthVal, setNewMonthVal] = useState("");
  const [showAddSub, setShowAddSub] = useState(false);

  const cacheTotal = (c) => Number(c.value)+Number(c.alimentacao||0)+Number(c.logistica||0);

  // Expands a parcelado expense into individual installment due dates
  const expandParcelas = (exp) => {
    if(exp.paymentType!=="parcelado"||!exp.datePay) return [{...exp,parcelaNum:null,parcelaTotal:null}];
    const n=parseInt(exp.parcelas)||2;
    const base=new Date(exp.datePay);
    return Array.from({length:n},(_,i)=>{
      const d=new Date(base);d.setMonth(d.getMonth()+i);
      return {...exp,id:`${exp.id}-p${i+1}`,datePay:d.toISOString().split("T")[0],value:Number(exp.value),parcelaNum:i+1,parcelaTotal:n};
    });
  };

  const startEdit = (type, item) => { setEditingId(`${type}:${item.id}`); setEditData({...item}); };
  const saveEdit = (type, setList) => { setList(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value)}:i)); setEditingId(null); setEditData({}); };
  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  // ── Totals ──
  const totals = useMemo(() => {
    const totalExpenses=expenses.reduce((s,e)=>s+Number(e.value),0);
    const paidExpenses=expenses.filter(e=>e.status==="pago").reduce((s,e)=>s+Number(e.value),0);
    const totalReceivables=jobs.reduce((s,j)=>s+Number(j.value),0);
    const totalNF=jobs.reduce((s,j)=>s+Number(j.value)*Number(j.nfRate||0),0);
    const totalLiquido=totalReceivables-totalNF;
    const received=jobs.filter(j=>j.status==="recebido").reduce((s,j)=>s+Number(j.value),0);
    const totalReimb=reimbursements.reduce((s,e)=>s+Number(e.value),0);
    const reimbReceived=reimbursements.filter(e=>e.status==="recebido").reduce((s,e)=>s+Number(e.value),0);
    const reimbPending=reimbursements.filter(e=>e.status==="pendente").reduce((s,e)=>s+Number(e.value),0);
    const totalCaches=caches.reduce((s,c)=>s+cacheTotal(c),0);
    const cachesPagos=caches.filter(c=>c.status==="pago").reduce((s,c)=>s+cacheTotal(c),0);
    const cachesAPagar=caches.filter(c=>c.status==="a pagar").reduce((s,c)=>s+cacheTotal(c),0);
    const totalProjExp=projectExpenses.reduce((s,e)=>s+Number(e.value),0);
    const balance=received-paidExpenses-cachesPagos-reimbReceived;
    // Projected now correctly deducts NF from each job's value
    const projected=totalLiquido-totalExpenses-totalCaches-totalProjExp-totalReimb;
    const studioLatest=(e)=>{const ks=Object.keys(e.monthly||{}).sort();return ks.length?Number(e.monthly[ks[ks.length-1]]||0):Number(e.value||0);};
    const studioFixedMonthly=studioExpenses.filter(e=>e.active!==false).reduce((s,e)=>s+studioLatest(e),0);
    const subsFixedMonthly=subscriptions.filter(e=>e.active!==false).reduce((s,e)=>s+(e.cycle==="anual"?Number(e.value)/12:Number(e.value)),0);
    const totalFixedMonthly=studioFixedMonthly+subsFixedMonthly;
    return {totalExpenses,paidExpenses,totalReceivables,totalNF,totalLiquido,received,totalReimb,reimbReceived,reimbPending,totalCaches,cachesPagos,cachesAPagar,totalProjExp,balance,projected,studioFixedMonthly,subsFixedMonthly,totalFixedMonthly};
  },[expenses,jobs,reimbursements,caches,projectExpenses,studioExpenses,subscriptions]);

  const [monthMode, setMonthMode] = useState("caixa"); // "caixa" | "competencia"
  const monthlyData = useMemo(() => {
    const map={};
    const add=(key,field,val)=>{if(!key)return;if(!map[key])map[key]={key,income:0,expenses:0,caches:0,projExp:0,reimb:0};map[key][field]+=val;};
    if(monthMode==="caixa"){
      // Regime de caixa: agrupa por datas REAIS de movimento de dinheiro
      jobs.filter(j=>j.status==="recebido"&&j.dateReceived).forEach(j=>add(monthKey(j.dateReceived),"income",Number(j.value)));
      caches.filter(c=>c.status==="pago").forEach(c=>add(monthKey(c.datePaid||c.dateDue||c.dateWork),"caches",cacheTotal(c)));
      expenses.filter(e=>e.status==="pago").forEach(e=>add(monthKey(e.datePay||e.dateWork),"expenses",Number(e.value)));
      projectExpenses.filter(e=>e.status==="pago").forEach(e=>add(monthKey(e.datePay||e.dateWork),"projExp",Number(e.value)));
      reimbursements.filter(r=>r.status==="recebido").forEach(r=>add(monthKey(r.datePay),"reimb",Number(r.value)));
    } else {
      // Regime de competência: agrupa por data de REALIZAÇÃO do trabalho
      jobs.forEach(j=>add(monthKey(j.dateWork||j.dateDueExpected),"income",Number(j.value)));
      caches.forEach(c=>add(monthKey(c.dateWork||c.dateDue),"caches",cacheTotal(c)));
      expenses.forEach(e=>add(monthKey(e.dateWork||e.datePay),"expenses",Number(e.value)));
      projectExpenses.forEach(e=>add(monthKey(e.dateWork||e.datePay),"projExp",Number(e.value)));
      reimbursements.forEach(r=>add(monthKey(r.datePay),"reimb",Number(r.value)));
    }
    return Object.values(map).sort((a,b)=>a.key.localeCompare(b.key));
  },[jobs,reimbursements,expenses,caches,projectExpenses,monthMode]);

  const reimbByPerson=useMemo(()=>{const g={};reimbursements.forEach(r=>{if(!g[r.pessoa])g[r.pessoa]=[];g[r.pessoa].push(r);});return g;},[reimbursements]);
  const reimbByTipo=useMemo(()=>{const g={};reimbursements.forEach(r=>{const t=r.tipo||"Adiantamento profissional";if(!g[t])g[t]=[];g[t].push(r);});return g;},[reimbursements]);

  // Upcoming payments in next 30 days
  const upcomingPayments = useMemo(()=>{
    const todayStr=today();const d30=new Date();d30.setDate(d30.getDate()+30);const d30Str=d30.toISOString().split("T")[0];
    const items=[];
    jobs.filter(j=>j.dateDueExpected&&j.dateDueExpected>=todayStr&&j.dateDueExpected<=d30Str&&j.status!=="recebido").forEach(j=>{
      const cl=clients.find(c=>c.id===j.clientId);
      items.push({tipo:"Receber de cliente",desc:`${j.desc}${cl?` (${cl.name})`:""}`,value:j.value-Number(j.valorRecebido||0),datePay:j.dateDueExpected,color:"#34d399",icon:"📥"});
    });
    caches.filter(c=>c.dateDue&&c.dateDue>=todayStr&&c.dateDue<=d30Str&&c.status!=="pago").forEach(c=>{
      const fl=freelancers.find(f=>f.id===c.freelancerId);const job=jobs.find(j=>j.id===c.jobId);
      items.push({tipo:"Pagar cachê",desc:`${fl?.apelido||fl?.name||"?"} — ${job?.desc||"?"}`,value:cacheTotal(c),datePay:c.dateDue,color:"#4D7CFE",icon:"👤"});
    });
    reimbursements.filter(r=>r.datePay&&r.datePay>=todayStr&&r.datePay<=d30Str&&r.status!=="recebido").forEach(r=>{
      items.push({tipo:"Reembolso",desc:`${r.pessoa} — ${r.desc}`,value:r.value,datePay:r.datePay,color:"#fb923c",icon:"🔄"});
    });
    projectExpenses.flatMap(expandParcelas).filter(e=>e.datePay&&e.datePay>=todayStr&&e.datePay<=d30Str&&e.status!=="pago").forEach(e=>{
      const job=jobs.find(j=>j.id===e.jobId);
      items.push({tipo:"Despesa projeto",desc:`${e.type}${e.desc?` — ${e.desc}`:""} (${job?.desc||"?"})${e.parcelaNum?` ${e.parcelaNum}/${e.parcelaTotal}`:""}`,value:e.value,datePay:e.datePay,color:"#f87171",icon:"💸"});
    });
    return items.sort((a,b)=>a.datePay.localeCompare(b.datePay));
  },[jobs,caches,reimbursements,projectExpenses,clients,freelancers]);
  const personColor = {"Yago":"#818cf8","Graba":"#fb923c","Maria":"#f472b6","Patrocinado":"#34d399","Cartão Japa":"#22d3ee","Cartão Frames":"#facc15"};
  const statusColor={pago:"#22c55e","a pagar":"#f59e0b",pendente:"#f59e0b",negociação:"#64748b",fechado:"#818cf8","em produção":"#f59e0b",entregue:"#22d3ee",faturado:"#fb923c",recebido:"#22c55e"};
  const toggleStatus=(list,setList,id,options)=>setList(p=>p.map(e=>{if(e.id!==id)return e;const i=options.indexOf(e.status);return{...e,status:options[(i+1)%options.length]};}));

  // Weekly "a pagar" view — all unpaid caches with no date or due this week
  const weeklyAPagar = useMemo(()=>{
    const d7=new Date();d7.setDate(d7.getDate()+7);const d7Str=d7.toISOString().split("T")[0];
    return caches
      .filter(c=>c.status==="a pagar"&&(!c.dateDue||c.dateDue<=d7Str))
      .map(c=>{const fl=freelancers.find(f=>f.id===c.freelancerId);const job=jobs.find(j=>j.id===c.jobId);const cl=job?clients.find(x=>x.id===job.clientId):null;return{...c,flName:fl?.name||"?",flApelido:fl?.apelido||fl?.name||"?",jobDesc:job?.desc||"?",clientName:cl?.name||"?",total:cacheTotal(c)};})
      .sort((a,b)=>(a.datePay||"9999").localeCompare(b.datePay||"9999"));
  },[caches,freelancers,jobs,clients]);

  // Global search
  const searchResults = useMemo(()=>{
    const q=searchQuery.toLowerCase().trim();
    if(!q) return null;
    const results=[];
    clients.filter(c=>c.name.toLowerCase().includes(q)).forEach(c=>results.push({type:"Cliente",label:c.name,sub:"",action:()=>{setTab("clients");setSelectedClient(c.id);setSelectedJob(null);}}));
    jobs.filter(j=>j.desc.toLowerCase().includes(q)||j.notes?.toLowerCase().includes(q)||j.contrato?.toLowerCase().includes(q)).forEach(j=>{const cl=clients.find(c=>c.id===j.clientId);results.push({type:"Job",label:j.desc,sub:cl?.name||"",action:()=>{setTab("clients");setSelectedClient(j.clientId);setSelectedJob(j.id);}});});
    freelancers.filter(f=>f.name.toLowerCase().includes(q)||f.apelido?.toLowerCase().includes(q)).forEach(f=>results.push({type:"Profissional",label:f.name,sub:f.apelido||"",action:()=>setTab("profissionais")}));
    return results.slice(0,8);
  },[searchQuery,clients,jobs,freelancers]);

  // Gera as datas de vencimento reais de cada parcela a partir da data do gasto.
  // Ex: gasto em 2026-06-10, 3x → vence 2026-07-10, 2026-08-10, 2026-09-10
  const buildParcelaDates = (dateWork, numParcelas) => {
    if (!dateWork || !numParcelas) return [];
    const dates = [];
    const base = new Date(dateWork + "T12:00:00");
    for (let i = 1; i <= Number(numParcelas); i++) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  };
  const addExpense=()=>{if(!formE.desc||!formE.value)return;const parcelas=formE.paymentType==="parcelado"?formE.parcelas:"1";const parcelasPagas=formE.paymentType==="parcelado"?formE.parcelasPagas:(formE.status==="pago"?"1":"0");const parcelaDates=formE.paymentType==="parcelado"?buildParcelaDates(formE.dateWork,parcelas):[];setExpenses(p=>[...p,{...formE,id:uid(),value:Number(formE.value),parcelas,parcelasPagas,parcelaDates,status:formE.paymentType==="parcelado"?(Number(parcelasPagas)>=Number(parcelas)?"pago":"a pagar"):formE.status}]);logChange(`Gasto: ${formE.desc}`);setFormE(emptyE);};
  const duplicateExpense=(item)=>{setExpenses(p=>[...p,{...item,id:uid(),desc:`${item.desc} (cópia)`}]);logChange(`Gasto duplicado: ${item.desc}`);};
  const addClient=()=>{if(!formClient.name)return;setClients(p=>[...p,{...formClient,id:uid()}]);logChange(`Cliente adicionado: ${formClient.name}`);setFormClient(emptyClient);setShowAddClient(false);};
  const removeClient=(id)=>{
    const cl=clients.find(c=>c.id===id);
    if(!confirmDelete(`Remover cliente "${cl?.name}" e todos os jobs, cachês e despesas vinculados?`)) return;
    const jobIds = jobs.filter(j=>j.clientId===id).map(j=>j.id);
    setJobs(p=>p.filter(j=>j.clientId!==id));
    setCaches(p=>p.filter(c=>!jobIds.includes(c.jobId)));
    setProjectExpenses(p=>p.filter(e=>!jobIds.includes(e.jobId)));
    setClients(p=>p.filter(c=>c.id!==id));
    logChange(`Cliente removido: ${cl?.name}`);
  };
  // Turns a whole client into a single job/project nested inside another client.
  // The dragged client's own jobs are kept as-is (still separate jobs) and just get
  // re-parented to the target client; the dragged client itself becomes a job too,
  // named after the client, so nothing about its history is lost.
  const mergeClientIntoClient=(draggedClientId, targetClientId)=>{
    if(draggedClientId===targetClientId) return;
    const draggedClient = clients.find(c=>c.id===draggedClientId);
    if(!draggedClient) return;
    setJobs(p=>p.map(j=>j.clientId===draggedClientId?{...j,clientId:targetClientId}:j));
    setClients(p=>p.filter(c=>c.id!==draggedClientId));
  };
  const addJob=()=>{
    if(!formJob.desc||!formJob.value||!selectedClient)return;
    const wd=(formJob.workDates||[]).slice().sort();
    setJobs(p=>[...p,{...formJob,id:uid(),clientId:selectedClient,value:Number(formJob.value),valorRecebido:Number(formJob.valorRecebido||0),nfRate:Number(formJob.nfRate),produtoraRate:Number(formJob.produtoraRate||0),workDates:wd,dateWork:wd[0]||""}]);
    logChange(`Job adicionado: ${formJob.desc}`);
    setFormJob(emptyJob);setShowAddJob(false);
  };
  const removeJob=(id)=>{const j=jobs.find(x=>x.id===id);if(!confirmDelete(`Remover job "${j?.desc}"?`))return;setJobs(p=>p.filter(j=>j.id!==id));setCaches(p=>p.filter(c=>c.jobId!==id));setProjectExpenses(p=>p.filter(e=>e.jobId!==id));logChange(`Job removido: ${j?.desc}`);};
  const addReimb=()=>{if(!formReim.pessoa||!formReim.desc||!formReim.value)return;setReimbursements(p=>[...p,{...formReim,id:uid(),value:Number(formReim.value)}]);logChange(`Reembolso: ${formReim.pessoa}`);setFormReim(emptyReim);};
  const addCacheToJob=()=>{
    if(!formCache.freelancerId||!formCache.value)return;
    const fl=freelancers.find(f=>f.id===formCache.freelancerId);
    const wd=(formCache.workDates||[]).slice().sort();
    setCaches(p=>[...p,{...formCache,id:uid(),jobId:selectedJob,value:Number(formCache.value),alimentacao:Number(formCache.alimentacao||0),logistica:Number(formCache.logistica||0),workDates:wd,dateWork:wd[0]||formCache.dateWork||""}]);
    logChange(`Cache: ${fl?.apelido||fl?.name}`);
    // Mantém as diárias preenchidas para o próximo profissional que for adicionado
    // neste mesmo job — só limpa quem é a pessoa, valor e outros dados pessoais.
    setFormCache({...emptyCache, workDates: wd, dateWork: wd[0]||formCache.dateWork||"", dateDue: formCache.dateDue});
  };
  const addProjectExpense=()=>{if(!formProjExp.value)return;setProjectExpenses(p=>[...p,{...formProjExp,id:uid(),jobId:selectedJob,value:Number(formProjExp.value)}]);logChange(`Despesa: ${formProjExp.type}`);setFormProjExp(emptyProjExp);setShowAddExpense(false);};
  const removeCache=(id)=>{const c=caches.find(x=>x.id===id);const fl=freelancers.find(f=>f.id===c?.freelancerId);if(!confirmDelete(`Remover cachê de ${fl?.apelido||fl?.name}?`))return;setCaches(p=>p.filter(c=>c.id!==id));logChange(`Cache removido: ${fl?.apelido||fl?.name}`);};
  const removeFreelancer=(id)=>{const fl=freelancers.find(f=>f.id===id);if(!confirmDelete(`Remover profissional "${fl?.name}"?`))return;setFreelancers(p=>p.filter(f=>f.id!==id));setCaches(p=>p.filter(c=>c.freelancerId!==id));logChange(`Profissional removido: ${fl?.name}`);};
  const removeProjExp=(id)=>{const e=projectExpenses.find(x=>x.id===id);if(!confirmDelete(`Remover despesa "${e?.type}"?`))return;setProjectExpenses(p=>p.filter(e=>e.id!==id));logChange(`Despesa removida: ${e?.type}`);};
  const duplicateCache=(c)=>{setCaches(p=>[...p,{...c,id:uid()}]);const fl=freelancers.find(f=>f.id===c.freelancerId);logChange(`Cachê duplicado: ${fl?.apelido||fl?.name}`);};
  const duplicateProjExp=(e)=>{setProjectExpenses(p=>[...p,{...e,id:uid()}]);logChange(`Despesa duplicada: ${e.type}`);};
  // Valor mais recente registrado de uma despesa (mês mais alto no histórico).
  const studioLatestValue = (e) => {
    const keys = Object.keys(e.monthly||{}).sort();
    if (keys.length===0) return Number(e.value||0);
    return Number(e.monthly[keys[keys.length-1]]||0);
  };
  const studioLatestMonth = (e) => {
    const keys = Object.keys(e.monthly||{}).sort();
    return keys.length ? keys[keys.length-1] : null;
  };
  const addStudioExpense=()=>{
    if(!formStudio.desc||!formStudio.value)return;
    const mk = today().slice(0,7);
    setStudioExpenses(p=>[...p,{...formStudio,id:uid(),value:Number(formStudio.value),monthly:{[mk]:Number(formStudio.value)}}]);
    logChange(`Despesa do estúdio: ${formStudio.desc}`);
    setFormStudio(emptyStudio);setShowAddStudio(false);
  };
  // Define/atualiza o valor de um mês específico de uma despesa fixa.
  const setStudioMonthValue=(id,monthKey,val)=>{
    setStudioExpenses(p=>p.map(e=>{
      if(e.id!==id)return e;
      const monthly={...(e.monthly||{})};
      if(val===""||val===null){delete monthly[monthKey];}
      else{monthly[monthKey]=Number(val);}
      return {...e,monthly};
    }));
  };
  const removeStudioExpense=(id)=>{const e=studioExpenses.find(x=>x.id===id);if(!confirmDelete(`Remover "${e?.desc}"?`))return;setStudioExpenses(p=>p.filter(e=>e.id!==id));logChange(`Despesa do estúdio removida: ${e?.desc}`);};
  const addSubscription=()=>{if(!formSub.desc||!formSub.value)return;setSubscriptions(p=>[...p,{...formSub,id:uid(),value:Number(formSub.value)}]);logChange(`Assinatura: ${formSub.desc}`);setFormSub(emptySub);setShowAddSub(false);};
  const removeSubscription=(id)=>{const e=subscriptions.find(x=>x.id===id);if(!confirmDelete(`Remover assinatura "${e?.desc}"?`))return;setSubscriptions(p=>p.filter(e=>e.id!==id));logChange(`Assinatura removida: ${e?.desc}`);};
  const addDemand=()=>{if(!formDemand.desc)return;setDemands(p=>[...p,{...formDemand,id:uid()}]);logChange(`Demanda: ${formDemand.desc}`);setFormDemand(emptyDemand);setShowAddDemand(false);};
  const removeDemand=(id)=>{const d=demands.find(x=>x.id===id);if(!confirmDelete(`Remover demanda "${d?.desc}"?`))return;setDemands(p=>p.filter(d=>d.id!==id));logChange(`Demanda removida: ${d?.desc}`);};
  const moveDemand=(id,dir)=>{setDemands(p=>p.map(d=>{if(d.id!==id)return d;const i=DEMAND_STATUS.indexOf(d.status);const ni=Math.min(DEMAND_STATUS.length-1,Math.max(0,i+dir));return {...d,status:DEMAND_STATUS[ni]};}));};

  const tabGroups = [
    { label:"Operacional", tabs:[{key:"demandas",label:"Demandas"},{key:"clients",label:"Clientes"},{key:"profissionais",label:"Profissionais"}] },
    { label:"Financeiro",  tabs:[{key:"dashboard",label:"Balanço"},{key:"expenses",label:"Gastos"},{key:"studio",label:"Estúdio"},{key:"subscriptions",label:"Assinaturas"},{key:"reimbursements",label:"Reembolsos"}] },
  ];
  const tabs=tabGroups.flatMap(g=>g.tabs);

  // ── Derived: client / job helpers ──
  const clientJobs = (clientId) => jobs.filter(j=>j.clientId===clientId);
  const jobCaches = (jobId) => caches.filter(c=>c.jobId===jobId);
  const jobExpenses = (jobId) => projectExpenses.filter(e=>e.jobId===jobId);
  const jobCostTotal = (jobId) => jobCaches(jobId).reduce((s,c)=>s+cacheTotal(c),0) + jobExpenses(jobId).reduce((s,e)=>s+Number(e.value),0);
  const clientTotals = (clientId) => {
    const cjobs = clientJobs(clientId);
    const totalValue = cjobs.reduce((s,j)=>s+Number(j.value),0);
    const totalRecebido = cjobs.reduce((s,j)=>s+Number(j.valorRecebido||0),0);
    const totalCusto = cjobs.reduce((s,j)=>s+jobCostTotal(j.id),0);
    const totalNF = cjobs.reduce((s,j)=>s+Number(j.value)*Number(j.nfRate||0),0);
    const margem = totalValue - totalNF - totalCusto;
    return { totalValue, totalRecebido, saldoDevedor: totalValue-totalRecebido, totalCusto, totalNF, margem, jobCount: cjobs.length };
  };

  const currentClient = selectedClient ? clients.find(c=>c.id===selectedClient) : null;
  const currentJob = selectedJob ? jobs.find(j=>j.id===selectedJob) : null;
  const currentJobColor = currentJob ? getColor(currentJob.id) : "#4D7CFE";
  const currentJobCaches = selectedJob ? jobCaches(selectedJob) : [];
  const currentJobExpList = selectedJob ? jobExpenses(selectedJob) : [];
  const currentJobTotal = selectedJob ? jobCostTotal(selectedJob) : 0;
  const expBySource = useMemo(()=>{const g={};currentJobExpList.forEach(e=>{if(!g[e.source])g[e.source]=[];g[e.source].push(e);});return g;},[currentJobExpList]);

  if (!loaded) return (
    <div style={{background:"#050507",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#4D7CFE",fontSize:16,fontFamily:"Inter,sans-serif"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",marginBottom:10}}>FRAMES<span style={{color:"#4D7CFE"}}>/</span>BR</div><div style={{fontSize:12,color:"#52525B"}}>Carregando dados…</div></div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Space Grotesk','Inter',sans-serif",background:"#050507",minHeight:"100vh",color:"#EDEDEF",paddingBottom:80}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @media (max-width: 480px) {
          .grid-2 { grid-template-columns: 1fr !important; }
          .grid-3 { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
          .font-large { font-size: 14px !important; }
        }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        input, select, button { -webkit-tap-highlight-color: transparent; font-family: 'Space Grotesk','Inter',sans-serif; }
        * { box-sizing: border-box; }
        ::selection { background: #4D7CFE44; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #050507; }
        ::-webkit-scrollbar-thumb { background: #232329; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #2E2E36; }
        .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
        button { transition: opacity .15s, background .15s, border-color .15s; }
        button:hover { opacity: .88; }
        input:focus, select:focus { border-color: #4D7CFE66 !important; box-shadow: 0 0 0 3px #4D7CFE15; }
        /* ── Site look: FRAMES/BR design system ── */
        .glow-top { position: fixed; top: -260px; left: 50%; transform: translateX(-50%); width: 900px; height: 600px; background: radial-gradient(ellipse at center, #4D7CFE18 0%, #8B5CF60A 40%, transparent 65%); pointer-events: none; z-index: 0; }
        .premium-card { position: relative; background: linear-gradient(145deg, #0C0C10 0%, #101018 100%) !important; overflow: hidden; transition: border-color .25s, transform .25s !important; }
        .premium-card::after { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, #4D7CFE, #8B5CF6, transparent); opacity: 0; transition: opacity .25s; }
        .premium-card:hover { border-color: #4D7CFE44 !important; transform: translateY(-3px); }
        .premium-card:hover::after { opacity: 1; }
        .btn-primary { background: linear-gradient(135deg, #4D7CFE 0%, #8B5CF6 100%) !important; box-shadow: 0 4px 20px #4D7CFE33 !important; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 32px #4D7CFE44 !important; opacity: 1 !important; }
        .grad-text { background: linear-gradient(135deg, #fff 30%, #4D7CFE 70%, #8B5CF6); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .sec-tag { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color: #4D7CFE; }
      `}</style>
      <div className="glow-top"/>
      {editingId&&editingId.startsWith("client:")&&<EditModal editData={editData} setEditData={setEditData} color="#34d399" onSave={()=>{setClients(p=>p.map(i=>i.id===editData.id?{...editData}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"name",label:"Nome do cliente"}]}/>}
      {editingId&&editingId.startsWith("job:")&&<EditModal editData={editData} setEditData={setEditData} color="#34d399" onSave={()=>{
        const wd=(editData.workDatesText||"").split(",").map(s=>s.trim()).filter(Boolean).sort();
        setJobs(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value),valorRecebido:Number(editData.valorRecebido||0),nfRate:Number(editData.nfRate),produtoraRate:Number(editData.produtoraRate||0),workDates:wd,dateWork:wd[0]||editData.dateWork||""}:i));
        setEditingId(null);setEditData({});
      }} onCancel={cancelEdit} fields={[{key:"desc",label:"Nome do projeto/job"},{key:"value",label:"Valor total (R$)",type:"number"},{key:"nfRate",label:"Nota Fiscal",type:"select",options:[{value:0,label:"Sem NF"},{value:0.06,label:"6%"},{value:0.12,label:"12%"}]},{key:"produtoraRate",label:"💼 % que fica para a produtora",type:"number"},{key:"contrato",label:"Nº contrato / link proposta"},{key:"notes",label:"Observações"},{key:"workDatesText",label:"📅 Diárias (datas separadas por vírgula, ex: 2026-07-01, 2026-07-02)"},{key:"dateDelivery",label:"📦 Entrega do material",type:"date"},{key:"dateInvoice",label:"🧾 Faturamento (NF emitida)",type:"date"},{key:"dateDueExpected",label:"💰 Previsão de recebimento",type:"date"},{key:"dateReceived",label:"✅ Recebido em (data real)",type:"date"},{key:"status",label:"Status",type:"select",options:JOB_STATUS}]}/>}
      {editingId&&editingId.startsWith("reimb:")&&<EditModal editData={editData} setEditData={setEditData} color="#fb923c" onSave={()=>saveEdit("reimb",setReimbursements)} onCancel={cancelEdit} fields={[{key:"pessoa",label:"Pessoa"},{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"devolvidoPara",label:"Devolvido para",type:"select",options:REIMB_SOURCES},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["pendente","recebido"]}]}/>}
      {editingId&&editingId.startsWith("cache:")&&<EditModal editData={editData} setEditData={setEditData} color="#4D7CFE" onSave={()=>{
        const wd=(editData.workDatesText||"").split(",").map(s=>s.trim()).filter(Boolean).sort();
        setCaches(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value),alimentacao:Number(editData.alimentacao||0),logistica:Number(editData.logistica||0),workDates:wd,dateWork:wd[0]||editData.dateWork||""}:i));
        cancelEdit();
      }} onCancel={cancelEdit} fields={[{key:"role",label:"Função",type:"select",options:ROLES},{key:"desc",label:"Descrição"},{key:"value",label:"Cachê (R$)",type:"number"},{key:"alimentacao",label:"Alimentação (R$)",type:"number"},{key:"logistica",label:"Logística (R$)",type:"number"},{key:"paymentMethod",label:"Forma de pagamento",type:"select",options:PAYMENT_METHODS},{key:"workDatesText",label:"📅 Diárias (datas separadas por vírgula)"},{key:"dateDue",label:"⏰ Combinado pagar em",type:"date"},{key:"datePaid",label:"✅ Pago em (data real)",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("projexp:")&&<EditModal editData={editData} setEditData={setEditData} color="#f87171" onSave={()=>saveEdit("projexp",setProjectExpenses)} onCancel={cancelEdit} fields={[{key:"type",label:"Tipo",type:"select",options:EXPENSE_TYPES},{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"source",label:"Origem",type:"select",options:PAYMENT_SOURCES},{key:"paymentType",label:"Pagamento",type:"select",options:["à vista","parcelado"]},{key:"parcelas",label:"Parcelas",type:"select",options:["2","3","4","5","6","7","8","9","10","11","12"]},{key:"dateWork",label:"📅 De",type:"date"},{key:"dateFim",label:"📅 Até (opcional)",type:"date"},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("exp:")&&<EditModal editData={editData} setEditData={setEditData} color="#f87171" onSave={()=>saveEdit("exp",setExpenses)} onCancel={cancelEdit} fields={[{key:"desc",label:"Descrição"},{key:"value",label:"Valor total (R$)",type:"number"},{key:"category",label:"Categoria",type:"select",options:CATEGORIES_EXPENSE},{key:"source",label:"💳 De onde saiu",type:"select",options:PAYMENT_SOURCES},{key:"paymentType",label:"Forma de pagamento",type:"select",options:["à vista","parcelado"]},{key:"parcelas",label:"Nº de parcelas",type:"select",options:["1","2","3","4","5","6","7","8","9","10","11","12","15","18","24"]},{key:"parcelasPagas",label:"Parcelas já pagas",type:"number"},{key:"dateWork",label:"Data do gasto",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("studio:")&&<EditModal editData={editData} setEditData={setEditData} color="#22d3ee" onSave={()=>saveEdit("studio",setStudioExpenses)} onCancel={cancelEdit} fields={[{key:"desc",label:"Descrição"},{key:"value",label:"Valor mensal (R$)",type:"number"},{key:"category",label:"Categoria",type:"select",options:STUDIO_CATEGORIES},{key:"dayOfMonth",label:"Dia do vencimento",type:"number"},{key:"dateStart",label:"Ativo desde",type:"date"}]}/>}
      {editingId&&editingId.startsWith("sub:")&&<EditModal editData={editData} setEditData={setEditData} color="#facc15" onSave={()=>saveEdit("sub",setSubscriptions)} onCancel={cancelEdit} fields={[{key:"desc",label:"Nome"},{key:"value",label:"Valor (R$)",type:"number"},{key:"category",label:"Categoria",type:"select",options:SUB_CATEGORIES},{key:"cycle",label:"Cobrança",type:"select",options:BILLING_CYCLES},{key:"dayOfMonth",label:"Dia da cobrança",type:"number"},{key:"dateStart",label:"Ativo desde",type:"date"}]}/>}
      {editingId&&editingId.startsWith("demand:")&&<EditModal editData={editData} setEditData={setEditData} color="#4D7CFE" onSave={()=>{setDemands(p=>p.map(i=>i.id===editData.id?{...editData,responsavelId:editData.responsavelId?Number(editData.responsavelId):"",jobId:editData.jobId?Number(editData.jobId):""}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"desc",label:"Demanda"},{key:"responsavelId",label:"Responsável",type:"select",options:[{value:"",label:"Sem responsável"},...freelancers.map(f=>({value:f.id,label:f.apelido||f.name}))]},{key:"jobId",label:"Job vinculado",type:"select",options:[{value:"",label:"Nenhum"},...jobs.map(j=>({value:j.id,label:j.desc}))]},{key:"prazo",label:"⏰ Prazo",type:"date"},{key:"prioridade",label:"Prioridade",type:"select",options:["alta","média","baixa"]},{key:"status",label:"Status",type:"select",options:["a fazer","fazendo","feito"]},{key:"notes",label:"Observações"}]}/>}
      {editingId&&editingId.startsWith("fl:")&&<EditModal editData={editData} setEditData={setEditData} color="#4D7CFE" onSave={()=>{setFreelancers(p=>p.map(i=>i.id===editData.id?{...editData}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"name",label:"Nome completo"},{key:"apelido",label:"Apelido"},{key:"role",label:"Função",type:"select",options:ROLES},{key:"phone",label:"WhatsApp"},{key:"email",label:"E-mail"},{key:"cpf",label:"CPF"},{key:"rg",label:"RG"},{key:"nasc",label:"Nascimento"}]}/>}

      {/* Error banner — shows real Firebase errors directly on screen, no devtools needed */}
      {saveError && (
        <div style={{background:"#7f1d1d",borderBottom:"2px solid #ef4444",padding:"10px 20px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:200}}>
          <span style={{fontSize:16}}>🔴</span>
          <div style={{flex:1,fontSize:12,color:"#fecaca"}}><strong>Problema ao salvar/carregar:</strong> {saveError}</div>
          <button onClick={()=>setSaveError(null)} style={{background:"transparent",border:"1px solid #fecaca66",color:"#fecaca",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>Fechar</button>
        </div>
      )}
      {/* Header */}
      <div style={{background:"#05050799",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderBottom:"1px solid #ffffff08",padding:"20px 24px 0",position:"sticky",top:0,zIndex:90}}>
        <div style={{maxWidth:820,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              {(selectedClient||selectedJob)&&(
                <button onClick={()=>{ if(selectedJob){setSelectedJob(null);setShowAddFL(false);setShowAddExpense(false);} else {setSelectedClient(null);} }} title="Voltar" style={{background:"#4D7CFE18",border:"1px solid #4D7CFE44",color:"#4D7CFE",borderRadius:8,padding:"6px 12px",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>‹ Voltar</button>
              )}
              <div style={{display:"flex",alignItems:"baseline",gap:12}}>
                <h1 style={{margin:0,fontSize:20,fontWeight:700,color:"#fff",letterSpacing:"-0.5px"}}>FRAMES<span style={{color:"#4D7CFE"}}>/</span>BR</h1>
                <span className="sec-tag">Financial System</span>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span className="mono" style={{fontSize:10,color:savedIndicator?"#22c55e":syncStatus==="offline"?"#ef4444":"#3F3F46",transition:"color .3s",letterSpacing:"1px",textTransform:"uppercase"}}>{savedIndicator?"● Salvo":syncStatus==="offline"?"● Offline":"○ Auto-save"}</span>
              {syncNotice&&<span className="mono" style={{fontSize:10,color:"#22d3ee",letterSpacing:"1px"}}>⟳ SYNC</span>}
              {syncStatus==="offline"&&<span className="mono" style={{fontSize:10,color:"#ef4444",letterSpacing:"1px"}}>Sem conexão com Firebase</span>}
              <button onClick={saveNow} disabled={isSavingNow} style={{background:"transparent",border:"1px solid #232329",color:"#A1A1AA",borderRadius:6,padding:"6px 14px",fontSize:11,fontWeight:500,cursor:isSavingNow?"default":"pointer",opacity:isSavingNow?0.5:1}}>
                {isSavingNow?"Salvando…":"Salvar"}
              </button>
              <button onClick={exportPdfSummary} style={{background:"transparent",border:"1px solid #232329",color:"#A1A1AA",borderRadius:6,padding:"6px 14px",fontSize:11,fontWeight:500,cursor:"pointer"}}>
                Exportar PDF
              </button>
              <div style={{width:1,height:14,background:"#232329"}}/>
              <span className="mono" style={{fontSize:10,color:"#52525B"}}>{userEmail}</span>
              <button onClick={onLogout} style={{background:"transparent",border:"1px solid #232329",color:"#71717A",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:500,cursor:"pointer"}}>
                Sair
              </button>
            </div>
          </div>
          {/* Search bar */}
          <div style={{position:"relative",marginBottom:14}}>
            <input
              placeholder="Buscar clientes, jobs, profissionais…"
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
              style={{width:"100%",background:"#0E0E12",border:"1px solid #1C1C22",borderRadius:8,padding:"9px 14px",color:"#EDEDEF",fontSize:13,outline:"none",boxSizing:"border-box"}}
            />
            {searchResults&&searchResults.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#101014",border:"1px solid #232329",borderRadius:8,zIndex:50,marginTop:4,overflow:"hidden",boxShadow:"0 8px 32px #00000088"}}>
                {searchResults.map((r,i)=>(
                  <div key={i} onClick={()=>{r.action();setSearchQuery("");}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #ffffff06",display:"flex",alignItems:"center",gap:10}}
                    onMouseEnter={e=>e.currentTarget.style.background="#ffffff06"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span className="mono" style={{fontSize:9,background:"#4D7CFE18",color:"#4D7CFE",borderRadius:4,padding:"2px 6px",flexShrink:0,letterSpacing:"1px",textTransform:"uppercase"}}>{r.type}</span>
                    <span style={{fontSize:13,color:"#EDEDEF"}}>{r.label}</span>
                    {r.sub&&<span style={{fontSize:11,color:"#52525B"}}>{r.sub}</span>}
                  </div>
                ))}
              </div>
            )}
            {searchResults&&searchResults.length===0&&searchQuery&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#101014",border:"1px solid #232329",borderRadius:8,zIndex:50,marginTop:4,padding:"12px 14px",fontSize:13,color:"#52525B"}}>Nenhum resultado para "{searchQuery}"</div>
            )}
          </div>
          <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"flex-end",gap:0}}>
              {tabGroups.map((group,gi)=>(<div key={group.label} style={{display:"flex",alignItems:"flex-end",gap:0}}>
                {gi>0&&<div style={{width:1,height:28,background:"#1C1C22",margin:"0 8px",alignSelf:"flex-end",marginBottom:0}}/>}
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  <span className="mono" style={{fontSize:8,color:"#3F3F46",letterSpacing:"2px",textTransform:"uppercase",paddingLeft:14,marginBottom:2}}>{group.label}</span>
                  <div style={{display:"flex"}}>
                    {group.tabs.map(t=>{
                      const hasAlert=t.key==="demandas"&&demands.some(d=>d.status!=="feito"&&d.prazo&&d.prazo<today());
                      return(<button key={t.key} onClick={()=>{setTab(t.key);setSelectedClient(null);setSelectedJob(null);setShowAddFL(false);setShowAddExpense(false);setShowAddClient(false);setShowAddJob(false);setSearchQuery("");}} style={{padding:"10px 14px",border:"none",borderBottom:"2px solid transparent",borderImage:tab===t.key?"linear-gradient(90deg,#4D7CFE,#8B5CF6) 1":"none",cursor:"pointer",fontSize:12,fontWeight:tab===t.key?600:500,background:"transparent",color:tab===t.key?"#fff":"#71717A",transition:"all .15s",position:"relative"}}>
                        {t.label}
                        {hasAlert&&<span style={{position:"absolute",top:6,right:6,width:6,height:6,borderRadius:"50%",background:"#ef4444"}}/>}
                      </button>);
                    })}
                  </div>
                </div>
              </div>))}
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",padding:"24px 24px 0"}}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
              {[{key:"geral",label:"Geral"},{key:"apagar",label:"A Pagar"},{key:"vencimentos",label:"Vencimentos"},{key:"mensal",label:"Por Mês"}].map(st=>(<button key={st.key} onClick={()=>setDashSubTab(st.key)} style={{padding:"8px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,borderRadius:8,background:dashSubTab===st.key?"#4D7CFE":"#101014",color:dashSubTab===st.key?"#fff":"#64748b"}}>{st.label}{st.key==="apagar"&&weeklyAPagar.length>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,marginLeft:6}}>{weeklyAPagar.length}</span>}</button>))}
            </div>
            {dashSubTab==="geral"&&(<>
              {(()=>{
                const demandasAtrasadas=demands.filter(d=>d.status!=="feito"&&d.prazo&&d.prazo<today());
                const parcelasVencendo=expenses.filter(e=>{
                  if(e.paymentType!=="parcelado")return false;
                  const pagas=Number(e.parcelasPagas||0);
                  const dates=e.parcelaDates||[];
                  const next=dates[pagas];
                  if(!next)return false;
                  const diff=(new Date(next)-new Date(today()))/(1000*60*60*24);
                  return diff<=7&&diff>=-1; // vence nos próximos 7 dias ou ontem
                });
                if(!demandasAtrasadas.length&&!parcelasVencendo.length)return null;
                return(<div style={{background:"#ef444412",border:"1px solid #ef444433",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#ef4444",marginBottom:10,letterSpacing:"1px",textTransform:"uppercase"}}>⚠ Requer atenção</div>
                  {demandasAtrasadas.map(d=>{const resp=freelancers.find(f=>f.id===d.responsavelId);return(<div key={d.id} onClick={()=>setTab("demandas")} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,cursor:"pointer"}}>
                    <span style={{fontSize:10,background:"#ef444422",color:"#ef4444",borderRadius:4,padding:"2px 6px",flexShrink:0,fontFamily:"monospace"}}>DEMANDA</span>
                    <span style={{fontSize:12,color:"#e2e8f0",flex:1}}>{d.desc}</span>
                    {resp&&<span style={{fontSize:11,color:"#64748b"}}>{resp.apelido||resp.name.split(" ")[0]}</span>}
                    <span style={{fontSize:11,color:"#ef4444",fontWeight:600}}>Prazo: {d.prazo}</span>
                  </div>);})}
                  {parcelasVencendo.map(e=>{const pagas=Number(e.parcelasPagas||0);const parcelas=Number(e.parcelas||1);const next=e.parcelaDates?.[pagas];const diff=Math.ceil((new Date(next)-new Date(today()))/(1000*60*60*24));return(<div key={e.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:10,background:"#f59e0b22",color:"#f59e0b",borderRadius:4,padding:"2px 6px",flexShrink:0,fontFamily:"monospace"}}>PARCELA</span>
                    <span style={{fontSize:12,color:"#e2e8f0",flex:1}}>{e.desc} <span style={{color:"#64748b"}}>({pagas}/{parcelas})</span></span>
                    <span style={{fontSize:11,color:diff<0?"#ef4444":"#f59e0b",fontWeight:600}}>{diff<0?`Atrasou ${Math.abs(diff)}d`:`Vence em ${diff}d`} · {formatBRL(Number(e.value)/parcelas)}</span>
                  </div>);})}
                </div>);
              })()}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                {[{label:"Saldo Atual",value:totals.balance,color:totals.balance>=0?"#22c55e":"#ef4444",sub:"recebido − gastos − cachês pagos − reembolsos pagos"},{label:"Projetado Líquido",value:totals.projected,color:"#4D7CFE",sub:`após NF (${formatBRL(totals.totalNF)}) − todos os custos`},{label:"Clientes (total bruto)",value:totals.totalReceivables,color:"#34d399",sub:`${formatBRL(totals.received)} já recebido`},{label:"Gastos nos projetos",value:totals.totalProjExp+totals.totalCaches,color:"#f87171",sub:`${formatBRL(totals.cachesAPagar)} cachês a pagar`},{label:"Custo fixo mensal",value:totals.totalFixedMonthly,color:"#22d3ee",sub:`${formatBRL(totals.studioFixedMonthly)} estúdio · ${formatBRL(totals.subsFixedMonthly)} assinaturas`}].map(c=>(
                  <div key={c.label} className="premium-card" style={{background:"#0E0E12",border:"1px solid #1C1C22",borderRadius:10,padding:"18px 20px"}}>
                    <div className="mono" style={{fontSize:10,color:"#52525B",marginBottom:6,letterSpacing:"1.5px",textTransform:"uppercase"}}>{c.label}</div>
                    <div className="mono" style={{fontSize:22,fontWeight:600,color:c.color}}>{formatBRL(c.value)}</div>
                    <div style={{fontSize:11,color:"#3F3F46",marginTop:5}}>{c.sub}</div>
                  </div>
                ))}
              </div>
              {/* Meta de faturamento */}
              <div style={{background:"#101014",border:"1px solid #1C1C22",borderRadius:10,padding:"16px 20px",marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showMeta&&meta.value?12:showMeta?12:0}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#cbd5e1"}}>🎯 Meta de faturamento</span>
                  <button onClick={()=>setShowMeta(v=>!v)} style={{background:"transparent",border:"none",color:"#64748b",fontSize:12,cursor:"pointer"}}>{showMeta?"▲ Fechar":"✏️ Definir meta"}</button>
                </div>
                {showMeta&&(<div style={{display:"flex",gap:8,marginBottom:meta.value?12:0}}>
                  <div style={{flex:1}}><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Valor da meta (R$)</div><input type="number" value={meta.value} onChange={e=>setMeta(p=>({...p,value:e.target.value}))} placeholder="Ex: 50000" style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Período</div><select value={meta.period} onChange={e=>setMeta(p=>({...p,period:e.target.value}))} style={{background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}><option value="mensal">Mensal</option><option value="anual">Anual</option></select></div>
                </div>)}
                {Number(meta.value)>0&&(()=>{const pct=Math.min((totals.totalReceivables/Number(meta.value))*100,100);return(<div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#64748b",marginBottom:6}}><span>{formatBRL(totals.totalReceivables)} de {formatBRL(meta.value)} ({meta.period})</span><span style={{color:pct>=100?"#22c55e":pct>=50?"#f59e0b":"#f87171",fontWeight:700}}>{pct.toFixed(0)}%</span></div>
                  <div style={{background:"#ffffff0f",borderRadius:6,height:10,overflow:"hidden"}}><div style={{background:pct>=100?"#22c55e":pct>=50?"#f59e0b":"#f87171",height:"100%",width:`${pct}%`,borderRadius:6,transition:"width .5s"}}/></div>
                </div>);})()}
              </div>
              <div style={{background:"#101014",border:"1px solid #1C1C22",borderRadius:10,padding:"20px",marginBottom:16}}>
                <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#cbd5e1"}}>🏢 Balanço por cliente</h3>
                {(()=>{
                  const ranked = clients
                    .map(cl=>{
                      const ct=clientTotals(cl.id);
                      // Tempo médio de recebimento: média de (dateReceived - dateInvoice||dateWork) dos jobs recebidos
                      const receivedJobs=jobs.filter(j=>j.clientId===cl.id&&j.status==="recebido"&&j.dateReceived&&(j.dateInvoice||j.dateWork));
                      const avgDays=receivedJobs.length>0
                        ? Math.round(receivedJobs.reduce((s,j)=>s+Math.max(0,(new Date(j.dateReceived)-new Date(j.dateInvoice||j.dateWork))/(1000*60*60*24)),0)/receivedJobs.length)
                        : null;
                      return {cl, ct, avgDays};
                    })
                    .filter(({ct})=>ct.jobCount>0)
                    .sort((a,b)=>b.ct.totalValue-a.ct.totalValue);
                  if(ranked.length===0) return <div style={{fontSize:12,color:"#475569"}}>Nenhum job lançado ainda.</div>;
                  return ranked.map(({cl,ct,avgDays},i)=>{
                    const cor=getColor(cl.id);
                    const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`;
                    return(<div key={cl.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"10px 12px",background:"#05050788",borderRadius:10,border:`1px solid ${cor}22`}}>
                      <span style={{fontSize:i<3?16:13,minWidth:24,textAlign:"center"}}>{medal}</span>
                      <div style={{width:8,height:8,borderRadius:"50%",background:cor,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{cl.name}</div>
                        <div style={{fontSize:11,color:"#64748b"}}>{ct.jobCount} job{ct.jobCount>1?"s":""}{avgDays!==null&&<span style={{color:avgDays<=15?"#22c55e":avgDays<=30?"#f59e0b":"#ef4444"}}> · paga em ~{avgDays}d</span>}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:14,fontWeight:700,color:"#34d399"}}>{formatBRL(ct.totalValue)}</div>
                        <div style={{fontSize:10,color:"#475569"}}>total contratado</div>
                      </div>
                    </div>);
                  });
                })()}
              </div>
              <div style={{background:"#101014",border:"1px solid #1C1C22",borderRadius:10,padding:"20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
                  <h3 style={{margin:0,fontSize:14,fontWeight:600,color:"#cbd5e1"}}>👥 Profissionais por cachê recebido</h3>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{display:"flex",gap:2,background:"#050507",borderRadius:8,padding:3}}>
                      {[{k:"geral",l:"Geral"},{k:"mensal",l:"Por mês"}].map(o=>(<button key={o.k} onClick={()=>setRankScope(o.k)} style={{padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:rankScope===o.k?"#4D7CFE":"transparent",color:rankScope===o.k?"#fff":"#71717A"}}>{o.l}</button>))}
                    </div>
                    {rankScope==="mensal"&&<input type="month" value={rankMonth} onChange={e=>setRankMonth(e.target.value)} style={{background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"5px 10px",color:"#e2e8f0",fontSize:12,outline:"none"}}/>}
                  </div>
                </div>
                {(()=>{
                  // No modo mensal, considera apenas cachês cujo trabalho (workDates)
                  // ou pagamento (datePaid) caem no mês selecionado.
                  const inMonth=(c)=>{
                    if(rankScope==="geral")return true;
                    const dates=[...(c.workDates||[]),c.dateWork,c.datePaid,c.dateDue].filter(Boolean);
                    return dates.some(d=>String(d).slice(0,7)===rankMonth);
                  };
                  const ranked = freelancers
                    .map(fl=>{
                      const fc=caches.filter(c=>c.freelancerId===fl.id).filter(inMonth);
                      const total=fc.reduce((s,c)=>s+cacheTotal(c),0);
                      const pagos=fc.filter(c=>c.status==="pago").reduce((s,c)=>s+cacheTotal(c),0);
                      const aPagar=total-pagos;
                      return {fl, total, pagos, aPagar, jobs:fc.length};
                    })
                    .filter(({total})=>total>0)
                    .sort((a,b)=>b.total-a.total);
                  if(ranked.length===0) return <div style={{fontSize:12,color:"#475569"}}>{rankScope==="mensal"?`Nenhum cachê em ${monthLabel(rankMonth)}.`:"Nenhum cachê lançado ainda."}</div>;
                  return ranked.map(({fl,total,pagos,aPagar,jobs},i)=>{
                    const flIdx=freelancers.findIndex(f=>f.id===fl.id);
                    const cor=getColor(flIdx);
                    const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`;
                    return(<div key={fl.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"10px 12px",background:"#05050788",borderRadius:10,border:`1px solid ${cor}22`}}>
                      <span style={{fontSize:i<3?16:13,minWidth:24,textAlign:"center"}}>{medal}</span>
                      <div style={{width:32,height:32,borderRadius:"50%",background:cor+"22",border:`2px solid ${cor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:cor,flexShrink:0}}>{fl.apelido?fl.apelido.slice(0,3):fl.name[0]}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{fl.apelido||fl.name.split(" ")[0]}</div>
                        <div style={{fontSize:11,color:"#64748b"}}>{jobs} job{jobs>1?"s":""}{aPagar>0&&<span style={{color:"#f59e0b"}}> · {formatBRL(aPagar)} a pagar</span>}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:14,fontWeight:700,color:"#f87171"}}>{formatBRL(total)}</div>
                        {pagos>0&&<div style={{fontSize:10,color:"#22c55e"}}>✅ {formatBRL(pagos)} pago</div>}
                      </div>
                    </div>);
                  });
                })()}
              </div>
              {changeLog.length>0&&<div style={{background:"#101014",border:"1px solid #1C1C22",borderRadius:10,padding:"20px",marginTop:16}}>
                <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#cbd5e1"}}>🕐 Histórico de alterações</h3>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {changeLog.map((l,i)=>(<div key={i} style={{display:"flex",gap:10,alignItems:"center",fontSize:12,padding:"6px 0",borderBottom:"1px solid #ffffff06"}}>
                    <span style={{color:"#475569",whiteSpace:"nowrap"}}>{l.date} {l.time}</span>
                    <span style={{color:"#94a3b8"}}>{l.desc}</span>
                  </div>))}
                </div>
              </div>}
            </>)}
            {dashSubTab==="apagar"&&(
              <div>
                <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Cachês sem data definida ou com vencimento nos próximos 7 dias.</p>
                {weeklyAPagar.length===0&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>🎉 Nenhum cachê pendente para esta semana!</div>}
                {weeklyAPagar.length>0&&(
                  <div>
                    <div style={{background:"#f8717115",border:"1px solid #f8717133",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:13,color:"#94a3b8"}}>Total a pagar</span>
                      <span style={{fontSize:15,fontWeight:700,color:"#f87171"}}>{formatBRL(weeklyAPagar.reduce((s,c)=>s+c.total,0))}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {weeklyAPagar.map(c=>{
                        const cor=getColor(freelancers.findIndex(f=>f.id===c.freelancerId));
                        const daysLeft=c.dateDue?Math.ceil((new Date(c.dateDue)-new Date(today()))/(1000*60*60*24)):null;
                        return(<div key={c.id} style={{background:"#101014",border:`1px solid ${cor}22`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                          <div style={{width:36,height:36,borderRadius:"50%",background:cor+"22",border:`2px solid ${cor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:cor,flexShrink:0}}>{c.flApelido.slice(0,3)}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{c.flName}</div>
                            <div style={{fontSize:11,color:"#64748b"}}>{c.jobDesc} · {c.clientName}</div>
                            {c.desc&&<div style={{fontSize:10,color:"#475569"}}>{c.desc}</div>}
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:14,fontWeight:700,color:"#f87171"}}>{formatBRL(c.total)}</div>
                            {daysLeft!==null?<div style={{fontSize:10,color:daysLeft<=0?"#ef4444":daysLeft<=3?"#f59e0b":"#64748b"}}>{daysLeft<=0?"Vencido!":daysLeft===1?"Amanhã":`${daysLeft}d`}</div>:<div style={{fontSize:10,color:"#475569"}}>Sem data</div>}
                          </div>
                          <button onClick={()=>toggleStatus(caches,setCaches,c.id,["a pagar","pago"])} style={{background:"#22c55e22",color:"#22c55e",border:"1px solid #22c55e44",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>✓ Pago</button>
                        </div>);
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {dashSubTab==="vencimentos"&&(
              <div>
                <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Pagamentos e recebimentos com vencimento nos próximos 30 dias.</p>
                {upcomingPayments.length===0&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>Nenhum vencimento nos próximos 30 dias. 🎉</div>}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {upcomingPayments.map((item,i)=>{
                    const daysLeft=Math.ceil((new Date(item.datePay)-new Date(today()))/(1000*60*60*24));
                    return(<div key={i} style={{background:"#101014",border:`1px solid ${item.color}33`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:18}}>{item.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.desc}</div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.tipo} · 📅 {item.datePay}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:14,fontWeight:700,color:item.color}}>{formatBRL(item.value)}</div>
                        <div style={{fontSize:10,color:daysLeft<=3?"#ef4444":daysLeft<=7?"#f59e0b":"#64748b"}}>{daysLeft===0?"Hoje!":daysLeft===1?"Amanhã":`${daysLeft} dias`}</div>
                      </div>
                    </div>);
                  })}
                </div>
              </div>
            )}
            {dashSubTab==="mensal"&&(
              <div>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16}}>
                  <div style={{display:"flex",gap:4,background:"#050507",borderRadius:8,padding:4}}>
                    {[{key:"caixa",label:"💵 Caixa"},{key:"competencia",label:"📋 Competência"}].map(m=>(
                      <button key={m.key} onClick={()=>setMonthMode(m.key)} style={{padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:monthMode===m.key?"#4D7CFE":"transparent",color:monthMode===m.key?"#fff":"#475569"}}>{m.label}</button>
                    ))}
                  </div>
                  <span style={{fontSize:11,color:"#475569"}}>{monthMode==="caixa"?"Quando o dinheiro se moveu de fato":"Quando o trabalho foi realizado"}</span>
                </div>
                {monthlyData.length===0&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>Adicione datas nos lançamentos para ver o balanço mensal.</div>}
                {(()=>{
                  const maxIncome=Math.max(...monthlyData.map(m=>m.income),1);
                  const maxOut=Math.max(...monthlyData.map(m=>m.expenses+m.caches+m.projExp+m.reimb),1);
                  const maxVal=Math.max(maxIncome,maxOut);
                  return monthlyData.map(m=>{
                    const saidas=m.expenses+m.caches+m.projExp+m.reimb;
                    const saldo=m.income-saidas;
                    return(<div key={m.key} style={{background:"#101014",border:"1px solid #1C1C22",borderRadius:10,padding:"18px 20px",marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                        <span style={{fontSize:15,fontWeight:700,color:"#fff"}}>{monthLabel(m.key)}</span>
                        <span style={{fontSize:16,fontWeight:700,color:saldo>=0?"#22c55e":"#ef4444"}}>{formatBRL(saldo)}</span>
                      </div>
                      <div style={{marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#64748b",marginBottom:4}}><span>📥 Entradas</span><span style={{color:"#34d399"}}>{formatBRL(m.income)}</span></div>
                        <div style={{background:"#ffffff0f",borderRadius:4,height:8,overflow:"hidden"}}><div style={{background:"#34d399",height:"100%",width:`${(m.income/maxVal)*100}%`,borderRadius:4,transition:"width .3s"}}/></div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#64748b",marginBottom:4,marginTop:8}}><span>💸 Saídas</span><span style={{color:"#f87171"}}>{formatBRL(saidas)}</span></div>
                        <div style={{background:"#ffffff0f",borderRadius:4,height:8,overflow:"hidden"}}><div style={{background:"#f87171",height:"100%",width:`${(saidas/maxVal)*100}%`,borderRadius:4,transition:"width .3s"}}/></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {m.caches>0&&<div style={{background:"#4D7CFE10",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>👥 Cachês</div><div style={{fontSize:13,fontWeight:600,color:"#4D7CFE"}}>{formatBRL(m.caches)}</div></div>}
                        {m.projExp>0&&<div style={{background:"#fb923c10",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>🧾 Despesas proj.</div><div style={{fontSize:13,fontWeight:600,color:"#fb923c"}}>{formatBRL(m.projExp)}</div></div>}
                        {m.reimb>0&&<div style={{background:"#f59e0b10",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>🔄 Reembolsos</div><div style={{fontSize:13,fontWeight:600,color:"#f59e0b"}}>{formatBRL(m.reimb)}</div></div>}
                      </div>
                    </div>);
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── CLIENTES — lista ── */}
        {tab==="clients"&&!selectedClient&&(
          <div>
            <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Selecione um cliente para ver e gerenciar os projetos/jobs dele. Arraste um cliente para cima de outro para transformá-lo em projeto dele.</p>
            <button onClick={()=>setShowAddClient(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddClient?"#101014":"#34d39922",border:"1px solid #34d39944",borderRadius:10,color:"#34d399",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddClient?"▲ Fechar":"＋ Adicionar cliente"}</button>
            {showAddClient&&(
              <FormCard title="Novo Cliente" color="#34d399">
                <Input label="Nome do cliente" value={formClient.name} onChange={v=>setFormClient(p=>({...p,name:v}))}/>
                <AddBtn onClick={addClient} color="#34d399">+ Cadastrar cliente</AddBtn>
              </FormCard>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {clients.map(cl=>{
                const ct=clientTotals(cl.id);const cor=getColor(cl.id);
                const isDragging = draggedClientId===cl.id;
                const isDragOver = dragOverClientId===cl.id && draggedClientId!==null && draggedClientId!==cl.id;
                return(<div key={cl.id}
                  draggable
                  onDragStart={(e)=>{setDraggedClientId(cl.id);e.dataTransfer.effectAllowed="move";}}
                  onDragEnd={()=>{setDraggedClientId(null);setDragOverClientId(null);}}
                  onDragOver={(e)=>{e.preventDefault();if(draggedClientId!==null&&draggedClientId!==cl.id)setDragOverClientId(cl.id);}}
                  onDragLeave={()=>setDragOverClientId(p=>p===cl.id?null:p)}
                  onDrop={(e)=>{e.preventDefault();if(draggedClientId!==null&&draggedClientId!==cl.id){mergeClientIntoClient(draggedClientId,cl.id);}setDraggedClientId(null);setDragOverClientId(null);}}
                  onClick={()=>{setSelectedClient(cl.id);setSelectedJob(null);}}
                  style={{background:"#101014",border:isDragOver?`2px dashed ${cor}`:`2px solid ${cor}33`,borderRadius:10,padding:"16px 18px",cursor:"grab",display:"flex",alignItems:"center",gap:14,opacity:isDragging?0.4:1,transition:"opacity .15s, border-color .15s"}}>
                  <div style={{color:"#475569",fontSize:14,cursor:"grab",flexShrink:0}}>⠿</div>
                  <div style={{width:44,height:44,borderRadius:"50%",background:cor+"22",border:`2px solid ${cor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:cor,flexShrink:0}}>{cl.name[0]}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{cl.name}</div>
                    <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{ct.jobCount===0?"Nenhum job ainda":`${ct.jobCount} job${ct.jobCount>1?"s":""} · ${formatBRL(ct.totalValue)} total`}</div>
                  </div>
                  {ct.jobCount>0&&<div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:700,color:ct.margem>=0?"#22c55e":"#ef4444"}}>{formatBRL(ct.margem)}</div>
                    <div style={{fontSize:10,color:"#475569"}}>margem</div>
                  </div>}
                  <button onClick={(e)=>{e.stopPropagation();startEdit("client",cl);}} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                  <div style={{color:"#475569",fontSize:18}}>›</div>
                </div>);
              })}
              {clients.length===0&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhum cliente cadastrado ainda.</div>}
            </div>
          </div>
        )}

        {/* ── CLIENTE — detalhe (lista de jobs) ── */}
        {tab==="clients"&&selectedClient&&!selectedJob&&currentClient&&(
          <div>
            <button onClick={()=>setSelectedClient(null)} style={{background:"transparent",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,marginBottom:16,padding:0}}>← Voltar aos clientes</button>
            {(()=>{const ct=clientTotals(selectedClient);const cor=getColor(selectedClient);return(
              <div style={{background:"#101014",border:`2px solid ${cor}33`,borderRadius:12,padding:"20px",marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:cor+"22",border:`2px solid ${cor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:cor}}>{currentClient.name[0]}</div>
                    <h2 style={{margin:0,fontSize:18,fontWeight:700,color:"#fff"}}>{currentClient.name}</h2>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>startEdit("client",currentClient)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"6px 10px"}}>✏️ Editar</button>
                    <button onClick={()=>removeClient(selectedClient)} style={{background:"#ef444422",border:"1px solid #ef444433",color:"#f87171",borderRadius:8,padding:"6px 12px",fontSize:11,cursor:"pointer"}}>Remover</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:"#34d39910",border:"1px solid #34d39930",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Valor total contratado</div><div style={{fontSize:16,fontWeight:700,color:"#34d399"}}>{formatBRL(ct.totalValue)}</div></div>
                  <div style={{background:"#22c55e12",border:"1px solid #22c55e33",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>✅ Já recebido</div><div style={{fontSize:16,fontWeight:700,color:"#22c55e"}}>{formatBRL(ct.totalRecebido)}</div></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:ct.saldoDevedor>0?"#f59e0b12":"#22c55e12",border:`1px solid ${ct.saldoDevedor>0?"#f59e0b33":"#22c55e33"}`,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>⏳ Saldo devedor</div><div style={{fontSize:16,fontWeight:700,color:ct.saldoDevedor>0?"#f59e0b":"#22c55e"}}>{formatBRL(ct.saldoDevedor)}</div></div>
                  <div style={{background:"#f8717112",border:"1px solid #f8717133",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Total custos (todos jobs)</div><div style={{fontSize:16,fontWeight:700,color:"#f87171"}}>− {formatBRL(ct.totalCusto)}</div></div>
                </div>
                <div style={{background:ct.margem>=0?"#22c55e12":"#ef444412",border:`1px solid ${ct.margem>=0?"#22c55e":"#ef4444"}33`,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:"#94a3b8",fontWeight:500}}>Margem líquida total do cliente</span><span style={{fontSize:18,fontWeight:700,color:ct.margem>=0?"#22c55e":"#ef4444"}}>{formatBRL(ct.margem)}</span></div>
              </div>
            );})()}

            <button onClick={()=>setShowAddJob(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddJob?"#101014":"#4D7CFE22",border:"1px solid #4D7CFE44",borderRadius:10,color:"#4D7CFE",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddJob?"▲ Fechar":"＋ Adicionar projeto/job para este cliente"}</button>
            {showAddJob&&(
              <FormCard title="Novo Projeto/Job" color="#4D7CFE">
                <Input label="Nome do projeto/job" value={formJob.desc} onChange={v=>setFormJob(p=>({...p,desc:v}))}/>
                <Input label="Valor total (R$)" type="number" value={formJob.value} onChange={v=>setFormJob(p=>({...p,value:v}))}/>
                <div>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>📅 Diárias de gravação (pode adicionar mais de uma)</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                    {(formJob.workDates||[]).map((d,i)=>(
                      <span key={i} style={{background:"#4D7CFE22",border:"1px solid #4D7CFE44",borderRadius:6,padding:"4px 8px",fontSize:11,color:"#4D7CFE",display:"flex",alignItems:"center",gap:6}}>
                        {d}
                        <button onClick={()=>setFormJob(p=>({...p,workDates:p.workDates.filter((_,x)=>x!==i)}))} style={{background:"transparent",border:"none",color:"#4D7CFE",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                      </span>
                    ))}
                    {(!formJob.workDates||formJob.workDates.length===0)&&<span style={{fontSize:11,color:"#475569"}}>Nenhuma diária adicionada ainda.</span>}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <input type="date" id="newWorkDateInput" defaultValue={today()} style={{flex:1,background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}/>
                    <button onClick={()=>{
                      const input=document.getElementById("newWorkDateInput");
                      const val=input.value;
                      if(!val)return;
                      setFormJob(p=>({...p,workDates:[...(p.workDates||[]),val].sort()}));
                    }} style={{background:"#4D7CFE",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>+ Adicionar diária</button>
                  </div>
                </div>
                <Row><Input label="📦 Entrega do material" type="date" value={formJob.dateDelivery} onChange={v=>setFormJob(p=>({...p,dateDelivery:v}))}/><Input label="🧾 Faturamento (NF)" type="date" value={formJob.dateInvoice} onChange={v=>setFormJob(p=>({...p,dateInvoice:v}))}/></Row>
                <Input label="💰 Previsão de recebimento" type="date" value={formJob.dateDueExpected} onChange={v=>setFormJob(p=>({...p,dateDueExpected:v}))}/>
                <Row>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Nota Fiscal</div>
                    <div style={{display:"flex",gap:4,background:"#050507",borderRadius:8,padding:4}}>
                      {[{label:"Sem NF",value:0},{label:"6%",value:0.06},{label:"12%",value:0.12}].map(opt=>(<button key={opt.label} onClick={()=>setFormJob(p=>({...p,nfRate:opt.value}))} style={{flex:1,padding:"6px 8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:formJob.nfRate===opt.value?"#f87171":"transparent",color:formJob.nfRate===opt.value?"#fff":"#475569"}}>{opt.label}</button>))}
                    </div>
                  </div>
                  <Input label="💼 % que fica para a produtora" type="number" value={formJob.produtoraRate} onChange={v=>setFormJob(p=>({...p,produtoraRate:v}))}/>
                </Row>
                <Select label="Status" value={formJob.status} onChange={v=>setFormJob(p=>({...p,status:v}))} options={JOB_STATUS}/>
                <Input label="Nº contrato / link da proposta (opcional)" value={formJob.contrato} onChange={v=>setFormJob(p=>({...p,contrato:v}))}/>
                <Input label="Observações (opcional)" value={formJob.notes} onChange={v=>setFormJob(p=>({...p,notes:v}))}/>
                <AddBtn onClick={addJob} color="#4D7CFE">+ Adicionar Job</AddBtn>
              </FormCard>
            )}

            {clientJobs(selectedClient).length===0&&!showAddJob&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhum projeto/job lançado ainda para este cliente.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {clientJobs(selectedClient).map(job=>{
                const cost=jobCostTotal(job.id);
                const nf=Number(job.value)*Number(job.nfRate||0);
                const margem=Number(job.value)-nf-cost;
                const saldoDevedor=Number(job.value)-Number(job.valorRecebido||0);
                return(<div key={job.id} onClick={()=>setSelectedJob(job.id)} style={{background:"#101014",border:"1px solid #18181D",borderRadius:10,padding:"14px 16px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{job.desc}{(()=>{
                        if(job.status==="recebido"||!job.dateDueExpected) return null;
                        const overdue=Math.ceil((new Date(today())-new Date(job.dateDueExpected))/(1000*60*60*24));
                        if(overdue>0) return <span style={{fontSize:10,background:"#ef444422",color:"#ef4444",border:"1px solid #ef444444",borderRadius:5,padding:"2px 6px",marginLeft:8,fontWeight:700}}>🔴 Atrasado {overdue}d</span>;
                        return null;
                      })()}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{(job.workDates&&job.workDates.length>0)?<span>📅 {job.workDates.length>1?`${job.workDates.length} diárias (${job.workDates[0]} a ${job.workDates[job.workDates.length-1]})`:job.workDates[0]}</span>:(job.dateWork&&<span>📅 {job.dateWork}</span>)}{job.dateDelivery&&<span> · 📦 {job.dateDelivery}</span>}{job.dateDueExpected&&<span> · 💰 prev. {job.dateDueExpected}</span>}{job.dateReceived&&<span style={{color:"#22c55e"}}> · ✅ {job.dateReceived}</span>}{job.nfRate>0&&<span> · NF {job.nfRate*100}%</span>}</div>
                      {job.contrato&&<div style={{fontSize:10,color:"#475569",marginTop:2}}>📋 {job.contrato}</div>}
                      {job.notes&&<div style={{fontSize:10,color:"#475569",marginTop:1}}>💬 {job.notes}</div>}
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(job.value)}</div>
                    <button onClick={(e)=>{e.stopPropagation();toggleStatus(jobs,setJobs,job.id,JOB_STATUS);}} style={{background:statusColor[job.status]+"22",color:statusColor[job.status],border:`1px solid ${statusColor[job.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{job.status}</button>
                    <button onClick={(e)=>{e.stopPropagation();startEdit("job",{...job,workDatesText:(job.workDates||[]).join(", ")});}} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                    <button onClick={(e)=>{e.stopPropagation();removeJob(job.id);}} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                  </div>
                  <div style={{display:"flex",gap:12,fontSize:11,color:"#64748b",paddingTop:6,borderTop:"1px solid #ffffff08"}}>
                    {Number(job.valorRecebido||0)>0&&<span style={{color:"#22c55e"}}>✅ {formatBRL(job.valorRecebido)}</span>}
                    {saldoDevedor>0&&<span style={{color:"#f59e0b"}}>⏳ {formatBRL(saldoDevedor)}</span>}
                    <span style={{color:"#f87171"}}>Custos: {formatBRL(cost)}</span>
                    <span style={{color:margem>=0?"#22c55e":"#ef4444",fontWeight:600,marginLeft:"auto"}}>Margem: {formatBRL(margem)}</span>
                  </div>
                </div>);
              })}
            </div>
          </div>
        )}

        {/* ── JOB — detalhe (equipe e despesas) ── */}
        {tab==="clients"&&selectedJob&&currentJob&&(
          <div>
            <button onClick={()=>{setSelectedJob(null);setShowAddFL(false);setShowAddExpense(false);}} style={{background:"transparent",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,marginBottom:16,padding:0}}>← Voltar para {currentClient?.name}</button>

            <div style={{background:"#101014",border:`2px solid ${currentJobColor}33`,borderRadius:12,padding:"20px",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:12,height:12,borderRadius:"50%",background:currentJobColor}}/><h2 style={{margin:0,fontSize:18,fontWeight:700,color:"#fff"}}>{currentJob.desc}</h2></div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{display:"flex",gap:4,background:"#050507",borderRadius:8,padding:4}}>
                    {[{label:"Sem NF",value:0},{label:"6%",value:0.06},{label:"12%",value:0.12}].map(opt=>{const active=Number(currentJob.nfRate)===opt.value;return(<button key={opt.label} onClick={()=>setJobs(p=>p.map(j=>j.id===selectedJob?{...j,nfRate:opt.value}:j))} style={{padding:"5px 11px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:active?"#f87171":"transparent",color:active?"#fff":"#475569"}}>{opt.label}</button>);})}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:11,color:"#64748b"}}>💼 % produtora</span>
                    <input type="number" value={currentJob.produtoraRate||0} onChange={e=>setJobs(p=>p.map(j=>j.id===selectedJob?{...j,produtoraRate:Number(e.target.value)}:j))} style={{width:60,background:"#050507",border:"1px solid #ffffff20",borderRadius:6,padding:"5px 8px",color:"#e2e8f0",fontSize:12,outline:"none"}}/>
                  </div>
                </div>
              </div>
              {(()=>{const clientVal=Number(currentJob.value)||0;const rate=Number(currentJob.nfRate)||0;const nf=clientVal*rate;const liquido=clientVal-nf;const margem=liquido-currentJobTotal;const produtoraPct=Number(currentJob.produtoraRate||0);const produtoraCut=liquido*(produtoraPct/100);const payments=Array.isArray(currentJob.payments)?currentJob.payments:[];const paidFromList=payments.reduce((s,p)=>s+Number(p.value),0);const jaRecebido=paidFromList>0?paidFromList:Number(currentJob.valorRecebido||0);const saldoDevedor=clientVal-jaRecebido;return(<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:"#34d39910",border:"1px solid #34d39930",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Valor do job</div><div style={{fontSize:16,fontWeight:700,color:"#34d399"}}>{formatBRL(clientVal)}</div><div style={{fontSize:10,color:statusColor[currentJob.status]}}>{currentJob.status}</div></div>
                  <div style={{background:rate>0?"#f8717115":"#ffffff08",border:`1px solid ${rate>0?"#f8717130":"#ffffff10"}`,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Nota Fiscal{rate>0?` (${rate*100}%)`:""}</div><div style={{fontSize:16,fontWeight:700,color:rate>0?"#f87171":"#334155"}}>{rate>0?`− ${formatBRL(nf)}`:"Sem desconto"}</div></div>
                </div>
                {produtoraPct>0&&(
                  <div style={{background:"#4D7CFE12",border:"1px solid #4D7CFE33",borderRadius:10,padding:"10px 12px",marginBottom:10}}><div style={{fontSize:11,color:"#64748b"}}>💼 Fica para a produtora ({produtoraPct}% do líquido)</div><div style={{fontSize:16,fontWeight:700,color:"#4D7CFE"}}>{formatBRL(produtoraCut)}</div></div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:"#22c55e12",border:"1px solid #22c55e33",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>✅ Já recebido</div><div style={{fontSize:16,fontWeight:700,color:"#22c55e"}}>{formatBRL(jaRecebido)}</div></div>
                  <div style={{background:saldoDevedor>0?"#f59e0b12":"#22c55e12",border:`1px solid ${saldoDevedor>0?"#f59e0b33":"#22c55e33"}`,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>⏳ Saldo devedor</div><div style={{fontSize:16,fontWeight:700,color:saldoDevedor>0?"#f59e0b":"#22c55e"}}>{formatBRL(saldoDevedor)}</div></div>
                </div>
                {/* Histórico de pagamentos parciais */}
                <div style={{background:"#05050766",border:"1px solid #18181D",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:payments.length>0?8:0}}>
                    <span style={{fontSize:12,fontWeight:600,color:"#94a3b8"}}>💵 Pagamentos recebidos</span>
                    <button onClick={()=>{
                      const v=window.prompt("Valor recebido (R$):");
                      if(!v||isNaN(Number(v)))return;
                      const d=window.prompt("Data do recebimento (AAAA-MM-DD):",today());
                      if(!d)return;
                      setJobs(p=>p.map(j=>{
                        if(j.id!==selectedJob)return j;
                        const newPayments=[...(Array.isArray(j.payments)?j.payments:[]),{value:Number(v),date:d}];
                        const totalPaid=newPayments.reduce((s,x)=>s+Number(x.value),0);
                        const fullyPaid=totalPaid>=Number(j.value);
                        return {...j,payments:newPayments,valorRecebido:totalPaid,dateReceived:fullyPaid?d:j.dateReceived,status:fullyPaid?"recebido":j.status};
                      }));
                      logChange(`Pagamento registrado: ${formatBRL(v)} em ${currentJob.desc}`);
                    }} style={{background:"#22c55e22",border:"1px solid #22c55e44",color:"#22c55e",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>+ Registrar pagamento</button>
                  </div>
                  {payments.map((p,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"4px 0",borderBottom:i<payments.length-1?"1px solid #ffffff06":"none"}}>
                      <span style={{color:"#64748b"}}>📅 {p.date}</span>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{color:"#22c55e",fontWeight:600}}>{formatBRL(p.value)}</span>
                        <button onClick={()=>{
                          if(!confirmDelete(`Remover pagamento de ${formatBRL(p.value)}?`))return;
                          setJobs(prev=>prev.map(j=>{
                            if(j.id!==selectedJob)return j;
                            const newPayments=j.payments.filter((_,x)=>x!==i);
                            const totalPaid=newPayments.reduce((s,x)=>s+Number(x.value),0);
                            return {...j,payments:newPayments,valorRecebido:totalPaid};
                          }));
                        }} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:13}}>✕</button>
                      </div>
                    </div>
                  ))}
                  {payments.length===0&&<div style={{fontSize:11,color:"#475569",marginTop:4}}>Nenhum pagamento registrado ainda. Use o botão acima quando o cliente pagar (parcial ou total).</div>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div style={{background:"#ffffff08",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Líquido{rate>0?" (após NF)":""}</div><div style={{fontSize:16,fontWeight:700,color:"#e2e8f0"}}>{formatBRL(liquido)}</div></div>
                  <div style={{background:"#ffffff08",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Total custos</div><div style={{fontSize:16,fontWeight:700,color:"#f87171"}}>− {formatBRL(currentJobTotal)}</div></div>
                </div>
                <div style={{marginTop:10,background:margem>=0?"#22c55e12":"#ef444412",border:`1px solid ${margem>=0?"#22c55e":"#ef4444"}33`,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:"#94a3b8",fontWeight:500}}>Margem líquida</span><span style={{fontSize:18,fontWeight:700,color:margem>=0?"#22c55e":"#ef4444"}}>{formatBRL(margem)}</span></div>
              </>);})()}
            </div>

            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {[{key:"equipe",label:"Equipe & Cachês"},{key:"gastos",label:"Despesas do Job"}].map(st=>(<button key={st.key} onClick={()=>{setJobSubTab(st.key);setShowAddFL(false);setShowAddExpense(false);}} style={{flex:1,padding:"10px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,borderRadius:10,background:jobSubTab===st.key?currentJobColor:"#101014",color:jobSubTab===st.key?"#fff":"#64748b"}}>{st.label}</button>))}
            </div>

            {jobSubTab==="equipe"&&(
              <div>
                <button onClick={()=>setShowAddFL(v=>{
                  const next=!v;
                  if(next && (!formCache.workDates||formCache.workDates.length===0) && currentJob?.workDates?.length>0){
                    setFormCache(p=>({...p,workDates:[...currentJob.workDates],dateWork:currentJob.workDates[0]}));
                  }
                  return next;
                })} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddFL?"#101014":currentJobColor+"22",border:`1px solid ${currentJobColor}44`,borderRadius:10,color:currentJobColor,fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddFL?"▲ Fechar":"＋ Adicionar profissional"}</button>
                {showAddFL&&(
                  <div style={{background:"#101014",border:`1px solid ${currentJobColor}33`,borderRadius:10,padding:20,marginBottom:16}}>
                    {freelancers.length>0?(<>
                      <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:currentJobColor}}>Adicionar cachê</h3>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Profissional</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{freelancers.map((fl,idx)=>{const cor=getColor(idx);const sel=formCache.freelancerId===fl.id;return(<button key={fl.id} onClick={()=>setFormCache(p=>({...p,freelancerId:fl.id,role:fl.role}))} style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",background:sel?cor:cor+"22",color:sel?"#fff":cor,border:`1px solid ${cor}`}}>{fl.apelido||fl.name.split(" ")[0]}</button>);})}</div>
                        </div>
                        <Row><Select label="Função" value={formCache.role} onChange={v=>setFormCache(p=>({...p,role:v}))} options={ROLES}/><Input label="💰 Cachê (R$)" type="number" value={formCache.value} onChange={v=>setFormCache(p=>({...p,value:v}))}/></Row>
                        <Input label="Descrição (opcional)" value={formCache.desc} onChange={v=>setFormCache(p=>({...p,desc:v}))}/>
                        <Row><Input label="🍽️ Alimentação (R$)" type="number" value={formCache.alimentacao} onChange={v=>setFormCache(p=>({...p,alimentacao:v}))}/><Input label="🚗 Logística (R$)" type="number" value={formCache.logistica} onChange={v=>setFormCache(p=>({...p,logistica:v}))}/></Row>
                        <div>
                          <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>📅 Diárias trabalhadas (herdadas do job, pode ajustar)</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                            {(formCache.workDates||[]).map((d,i)=>(
                              <span key={i} style={{background:currentJobColor+"22",border:`1px solid ${currentJobColor}44`,borderRadius:6,padding:"4px 8px",fontSize:11,color:currentJobColor,display:"flex",alignItems:"center",gap:6}}>
                                {d}
                                <button onClick={()=>setFormCache(p=>({...p,workDates:p.workDates.filter((_,x)=>x!==i)}))} style={{background:"transparent",border:"none",color:currentJobColor,cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                              </span>
                            ))}
                            {(!formCache.workDates||formCache.workDates.length===0)&&<span style={{fontSize:11,color:"#475569"}}>Nenhuma diária ainda.</span>}
                          </div>
                          <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
                            <div><div style={{fontSize:10,color:"#64748b",marginBottom:4}}>De</div><input type="date" id="cacheRangeStart" defaultValue={formCache.workDates?.[0]||today()} style={{background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:12,outline:"none"}}/></div>
                            <div><div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Até</div><input type="date" id="cacheRangeEnd" defaultValue={formCache.workDates?.[0]||today()} style={{background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:12,outline:"none"}}/></div>
                            <button onClick={()=>{
                              const start=document.getElementById("cacheRangeStart").value;
                              const end=document.getElementById("cacheRangeEnd").value;
                              if(!start||!end)return;
                              const dates=[];
                              let cur=new Date(start);const last=new Date(end);
                              while(cur<=last){ dates.push(cur.toISOString().split("T")[0]); cur.setDate(cur.getDate()+1); }
                              setFormCache(p=>({...p,workDates:Array.from(new Set([...(p.workDates||[]),...dates])).sort(),dateWork:p.dateWork||dates[0]}));
                            }} style={{background:currentJobColor,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>+ Gerar diárias do período</button>
                          </div>
                        </div>
                        <Row><Input label="⏰ Combinado pagar em" type="date" value={formCache.dateDue} onChange={v=>setFormCache(p=>({...p,dateDue:v}))}/><Input label="✅ Pago em (data real)" type="date" value={formCache.datePaid} onChange={v=>setFormCache(p=>({...p,datePaid:v}))}/></Row>
                        <Row><Select label="Status" value={formCache.status} onChange={v=>setFormCache(p=>({...p,status:v}))} options={["a pagar","pago"]}/><Select label="Forma de pagamento" value={formCache.paymentMethod||"Pix/Transferência"} onChange={v=>setFormCache(p=>({...p,paymentMethod:v}))} options={PAYMENT_METHODS}/></Row>
                        <AddBtn onClick={addCacheToJob} color={currentJobColor}>+ Adicionar</AddBtn>
                      </div>
                      <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #ffffff0a"}}><button onClick={()=>setShowNewFLForm(v=>!v)} style={{background:"transparent",border:"none",color:"#64748b",fontSize:12,cursor:"pointer",padding:0}}>{showNewFLForm?"▲ Cancelar":"＋ Cadastrar novo profissional"}</button></div>
                    </>):null}
                    {(showNewFLForm||freelancers.length===0)&&(
                      <div style={{marginTop:freelancers.length>0?12:0}}>
                        <h3 style={{margin:"0 0 12px",fontSize:13,fontWeight:600,color:"#94a3b8"}}>Novo profissional</h3>
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          <Row><Input label="Nome" value={formFL.name} onChange={v=>setFormFL(p=>({...p,name:v}))}/><Input label="Apelido" value={formFL.apelido} onChange={v=>setFormFL(p=>({...p,apelido:v}))}/></Row>
                          <Row><Select label="Função" value={formFL.role} onChange={v=>setFormFL(p=>({...p,role:v}))} options={ROLES}/><Input label="💰 Cachê (R$)" type="number" value={formCache.value} onChange={v=>setFormCache(p=>({...p,value:v}))}/></Row>
                          <Input label="Descrição (opcional)" value={formCache.desc} onChange={v=>setFormCache(p=>({...p,desc:v}))}/>
                          <AddBtn onClick={()=>{if(!formFL.name)return;const id=uid();setFreelancers(prev=>[...prev,{...formFL,id}]);if(formCache.value)setCaches(prev=>[...prev,{...formCache,id:uid(),freelancerId:id,jobId:selectedJob,value:Number(formCache.value),alimentacao:Number(formCache.alimentacao||0),logistica:Number(formCache.logistica||0)}]);setFormFL(emptyFL);setFormCache(emptyCache);setShowNewFLForm(false);setShowAddFL(false);}} color={currentJobColor}>+ Cadastrar e adicionar</AddBtn>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {currentJobCaches.length===0&&!showAddFL&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>Nenhum profissional adicionado. <span style={{color:currentJobColor,cursor:"pointer"}} onClick={()=>setShowAddFL(true)}>+ Adicionar</span></div>}
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {currentJobCaches.map(c=>{
                    const fl=freelancers.find(f=>f.id===c.freelancerId);const flIdx=freelancers.findIndex(f=>f.id===c.freelancerId);const cor=getColor(flIdx);const total=cacheTotal(c);
                    return(<div key={c.id} style={{background:"#101014",border:`1px solid ${cor}22`,borderRadius:10,padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                        <div style={{width:38,height:38,borderRadius:"50%",background:cor+"22",border:`2px solid ${cor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:cor,flexShrink:0}}>{fl?(fl.apelido?fl.apelido.slice(0,3):fl.name[0]):"?"}</div>
                        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{fl?.name||"\u2014"}{c.desc&&<span style={{color:"#64748b",fontWeight:400}}> \u2014 {c.desc}</span>}{(()=>{if(c.status==="pago")return null;const ref=c.dateDue||c.dateWork;if(!ref)return null;const age=Math.ceil((new Date(today())-new Date(ref))/(1000*60*60*24));if(age>30)return <span style={{fontSize:10,background:"#ef444422",color:"#ef4444",borderRadius:5,padding:"2px 6px",marginLeft:6,fontWeight:700}}>h\u00e1 {age}d sem pagar</span>;return null;})()}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{c.role}{(c.workDates&&c.workDates.length>0)?` \u00b7 \ud83d\udcc5 ${c.workDates.length>1?`${c.workDates.length} di\u00e1rias (${c.workDates[0]} a ${c.workDates[c.workDates.length-1]})`:c.workDates[0]}`:(c.dateWork&&` \u00b7 \ud83d\udcc5 ${c.dateWork}`)}{c.dateDue&&` \u00b7 \u23f0 ${c.dateDue}`}{c.datePaid&&<span style={{color:"#22c55e"}}> \u00b7 \u2705 {c.datePaid}</span>}{c.paymentMethod&&c.status==="pago"&&<span style={{color:"#22c55e"}}> \u00b7 {c.paymentMethod}</span>}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{formatBRL(total)}</div></div>
                        <button onClick={()=>toggleStatus(caches,setCaches,c.id,["a pagar","pago"])} style={{background:statusColor[c.status]+"22",color:statusColor[c.status],border:`1px solid ${statusColor[c.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{c.status}</button>
                        <button onClick={()=>duplicateCache(c)} title="Duplicar" style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>⧉</button>
                        <button onClick={()=>startEdit("cache",{...c,workDatesText:(c.workDates||[]).join(", ")})} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                        <button onClick={()=>removeCache(c.id)} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                      </div>
                      <div style={{display:"flex",gap:8,paddingLeft:50}}>
                        <div style={{background:"#4D7CFE15",border:"1px solid #4D7CFE33",borderRadius:8,padding:"5px 10px",flex:1}}><div style={{fontSize:10,color:"#4D7CFE",marginBottom:2}}>💰 Cachê</div><div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{formatBRL(c.value)}</div></div>
                        <div style={{background:"#34d39915",border:"1px solid #34d39933",borderRadius:8,padding:"5px 10px",flex:1}}><div style={{fontSize:10,color:"#34d399",marginBottom:2}}>🍽️ Alimentação</div><div style={{fontSize:13,fontWeight:700,color:c.alimentacao?"#e2e8f0":"#334155"}}>{formatBRL(c.alimentacao||0)}</div></div>
                        <div style={{background:"#22d3ee15",border:"1px solid #22d3ee33",borderRadius:8,padding:"5px 10px",flex:1}}><div style={{fontSize:10,color:"#22d3ee",marginBottom:2}}>🚗 Logística</div><div style={{fontSize:13,fontWeight:700,color:c.logistica?"#e2e8f0":"#334155"}}>{formatBRL(c.logistica||0)}</div></div>
                      </div>
                    </div>);
                  })}
                </div>
              </div>
            )}

            {jobSubTab==="gastos"&&(
              <div>
                <button onClick={()=>setShowAddExpense(v=>{
                  const next=!v;
                  if(next && currentJob){
                    const jobDate = currentJob.workDates?.[0] || currentJob.dateWork || "";
                    setFormProjExp(p=>({...p,dateWork:jobDate}));
                  }
                  return next;
                })} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddExpense?"#101014":"#f8717122",border:"1px solid #f8717144",borderRadius:10,color:"#f87171",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddExpense?"▲ Fechar":"＋ Adicionar despesa"}</button>
                {showAddExpense&&(
                  <div style={{background:"#101014",border:"1px solid #f8717133",borderRadius:10,padding:20,marginBottom:16}}>
                    <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#f87171"}}>Nova Despesa</h3>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Tipo de gasto</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{EXPENSE_TYPES.map(t=>(<button key={t} onClick={()=>setFormProjExp(p=>({...p,type:t}))} style={{padding:"5px 11px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:formProjExp.type===t?"#f87171":"#f8717120",color:formProjExp.type===t?"#fff":"#f87171"}}>{TYPE_ICON[t]} {t}</button>))}</div>
                      </div>
                      <Input label="Descrição (opcional)" value={formProjExp.desc} onChange={v=>setFormProjExp(p=>({...p,desc:v}))}/>
                      {formProjExp.type==="Hotel/Airbnb"&&<Input label="🔗 Link da reserva (opcional)" value={formProjExp.link} onChange={v=>setFormProjExp(p=>({...p,link:v}))}/>}
                      <Input label="Valor (R$)" type="number" value={formProjExp.value} onChange={v=>setFormProjExp(p=>({...p,value:v}))}/>
                      <Row><Input label={formProjExp.type==="Hotel/Airbnb"?"📅 Check-in":"📅 De (já vem da realização do job)"} type="date" value={formProjExp.dateWork} onChange={v=>setFormProjExp(p=>({...p,dateWork:v}))}/><Input label={formProjExp.type==="Hotel/Airbnb"?"📅 Check-out":"📅 Até (opcional)"} type="date" value={formProjExp.dateFim} onChange={v=>setFormProjExp(p=>({...p,dateFim:v}))}/></Row>
                      {formProjExp.type==="Hotel/Airbnb"&&<Input label="👥 Nº de hóspedes (opcional)" type="number" value={formProjExp.hospedes} onChange={v=>setFormProjExp(p=>({...p,hospedes:v}))}/>}
                      <Input label="💰 Data de pagamento" type="date" value={formProjExp.datePay} onChange={v=>setFormProjExp(p=>({...p,datePay:v}))}/>
                      <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>De onde saiu o dinheiro</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{PAYMENT_SOURCES.map(s=>{const cor=SOURCE_COLOR[s]||"#94a3b8";const sel=formProjExp.source===s;return(<button key={s} onClick={()=>setFormProjExp(p=>({...p,source:s}))} style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",background:sel?cor:cor+"22",color:sel?"#000":cor,border:`1px solid ${cor}66`}}>{s}</button>);})}</div>
                      </div>
                      <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Forma de pagamento</div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          {["à vista","parcelado"].map(pt=>(<button key={pt} onClick={()=>setFormProjExp(p=>({...p,paymentType:pt}))} style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:formProjExp.paymentType===pt?"#4D7CFE":"#4D7CFE22",color:formProjExp.paymentType===pt?"#fff":"#4D7CFE"}}>{pt==="à vista"?"💵 À vista":"📆 Parcelado"}</button>))}
                          {formProjExp.paymentType==="parcelado"&&<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:"#64748b"}}>Parcelas:</span><select value={formProjExp.parcelas} onChange={e=>setFormProjExp(p=>({...p,parcelas:e.target.value}))} style={{background:"#050507",border:"1px solid #ffffff20",borderRadius:6,padding:"4px 8px",color:"#e2e8f0",fontSize:12}}>{["2","3","4","5","6","7","8","9","10","11","12"].map(n=><option key={n}>{n}x</option>)}</select></div>}
                        </div>
                      </div>
                      <Select label="Status" value={formProjExp.status} onChange={v=>setFormProjExp(p=>({...p,status:v}))} options={["a pagar","pago"]}/>
                      <AddBtn onClick={addProjectExpense} color="#f87171">+ Adicionar despesa</AddBtn>
                    </div>
                  </div>
                )}
                {currentJobExpList.length===0&&!showAddExpense&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>Nenhuma despesa lançada. <span style={{color:"#f87171",cursor:"pointer"}} onClick={()=>setShowAddExpense(true)}>+ Adicionar</span></div>}
                {Object.entries(expBySource).map(([source,items])=>{
                  const total=items.reduce((s,e)=>s+Number(e.value),0);const cor=SOURCE_COLOR[source]||"#94a3b8";
                  return(<div key={source} style={{marginBottom:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:13,fontWeight:700,color:cor}}>💳 {source}</span><span style={{fontSize:13,fontWeight:700,color:"#fff"}}>{formatBRL(total)}</span></div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {items.map(item=>(<div key={item.id} style={{background:"#101014",border:`1px solid ${cor}22`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:18}}>{TYPE_ICON[item.type]||"📦"}</span>
                        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.type}{item.desc?` — ${item.desc}`:""}{item.link&&<a href={item.link} target="_blank" rel="noopener noreferrer" style={{marginLeft:8,fontSize:11,color:"#22d3ee"}}>🔗 ver reserva</a>}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.dateWork&&<span>📅 {item.dateWork}{item.dateFim?` → ${item.dateFim}`:""}</span>}{item.hospedes&&<span> · 👥 {item.hospedes} hóspede{Number(item.hospedes)>1?"s":""}</span>}{item.datePay&&<span> · 💰 {item.datePay}</span>}{item.paymentType==="parcelado"&&<span style={{color:"#4D7CFE",marginLeft:6}}>📆 {item.parcelas}x</span>}</div></div>
                        <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}</div>
                        <button onClick={()=>toggleStatus(projectExpenses,setProjectExpenses,item.id,["a pagar","pago"])} style={{background:statusColor[item.status]+"22",color:statusColor[item.status],border:`1px solid ${statusColor[item.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.status}</button>
                        <button onClick={()=>duplicateProjExp(item)} title="Duplicar" style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>⧉</button>
                        <button onClick={()=>startEdit("projexp",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                        <button onClick={()=>removeProjExp(item.id)} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                      </div>))}
                    </div>
                  </div>);
                })}
                {currentJobExpList.length>0&&<SummaryPill label="Total despesas do job" value={currentJobExpList.reduce((s,e)=>s+Number(e.value),0)} color="#f87171"/>}
              </div>
            )}
          </div>
        )}

        {/* ── DEMANDAS (kanban) ── */}
        {tab==="demandas"&&(
          <div>
            <button onClick={()=>setShowAddDemand(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddDemand?"#101014":"#4D7CFE18",border:"1px solid #4D7CFE44",borderRadius:10,color:"#4D7CFE",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddDemand?"▲ Fechar":"＋ Nova demanda"}</button>
            {showAddDemand&&(
              <FormCard title="Nova Demanda" color="#4D7CFE">
                <Input label="O que precisa ser feito" value={formDemand.desc} onChange={v=>setFormDemand(p=>({...p,desc:v}))}/>
                <Row>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Responsável</div>
                    <select value={formDemand.responsavelId||""} onChange={e=>setFormDemand(p=>({...p,responsavelId:e.target.value?Number(e.target.value):""}))} style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}>
                      <option value="">Sem responsável</option>
                      {freelancers.map(f=><option key={f.id} value={f.id}>{f.apelido||f.name}</option>)}
                    </select>
                  </div>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Job vinculado</div>
                    <select value={formDemand.jobId||""} onChange={e=>setFormDemand(p=>({...p,jobId:e.target.value?Number(e.target.value):""}))} style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}>
                      <option value="">Nenhum</option>
                      {jobs.map(j=><option key={j.id} value={j.id}>{j.desc}</option>)}
                    </select>
                  </div>
                </Row>
                <Row>
                  <Input label="⏰ Prazo" type="date" value={formDemand.prazo} onChange={v=>setFormDemand(p=>({...p,prazo:v}))}/>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Prioridade</div>
                    <div style={{display:"flex",gap:6}}>{Object.keys(DEMAND_PRIORITY).map(pr=>{const cor=DEMAND_PRIORITY[pr];const sel=formDemand.prioridade===pr;return(<button key={pr} onClick={()=>setFormDemand(p=>({...p,prioridade:pr}))} style={{flex:1,padding:"8px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",background:sel?cor:cor+"22",color:sel?"#fff":cor,border:`1px solid ${cor}55`}}>{pr}</button>);})}</div>
                  </div>
                </Row>
                <Input label="Observações (opcional)" value={formDemand.notes} onChange={v=>setFormDemand(p=>({...p,notes:v}))}/>
                <AddBtn onClick={addDemand} color="#4D7CFE">+ Criar demanda</AddBtn>
              </FormCard>
            )}
            <div className="grid-3">
              {DEMAND_STATUS.map(st=>{
                const items=demands.filter(d=>d.status===st).sort((a,b)=>{const po={"alta":0,"média":1,"baixa":2};return (po[a.prioridade]??1)-(po[b.prioridade]??1);});
                const stColor=st==="a fazer"?"#f59e0b":st==="fazendo"?"#4D7CFE":"#22c55e";
                const stIcon=st==="a fazer"?"○":st==="fazendo"?"◐":"●";
                return(<div key={st} style={{background:"#0C0C10",border:"1px solid #18181D",borderRadius:10,padding:12,minHeight:200}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,padding:"0 4px"}}>
                    <span className="mono" style={{fontSize:11,color:stColor,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase"}}>{stIcon} {st}</span>
                    <span className="mono" style={{fontSize:11,color:"#52525B"}}>{items.length}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {items.length===0&&<div style={{fontSize:11,color:"#3F3F46",textAlign:"center",padding:"20px 0"}}>Vazio</div>}
                    {items.map(d=>{
                      const resp=freelancers.find(f=>f.id===d.responsavelId);
                      const respIdx=freelancers.findIndex(f=>f.id===d.responsavelId);
                      const respCor=resp?getColor(respIdx):"#52525B";
                      const job=jobs.find(j=>j.id===d.jobId);
                      const atrasada=d.prazo&&d.status!=="feito"&&d.prazo<today();
                      const prCor=DEMAND_PRIORITY[d.prioridade]||"#f59e0b";
                      return(<div key={d.id} style={{background:"#101014",border:`1px solid ${atrasada?"#ef444455":"#1C1C22"}`,borderRadius:8,padding:"10px 12px"}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                          <div style={{width:4,alignSelf:"stretch",background:prCor,borderRadius:2,flexShrink:0}}/>
                          <div style={{flex:1,fontSize:13,fontWeight:500,color:d.status==="feito"?"#71717A":"#e2e8f0",textDecoration:d.status==="feito"?"line-through":"none"}}>{d.desc}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",fontSize:10,color:"#64748b",paddingLeft:12}}>
                          {resp&&<span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:16,height:16,borderRadius:"50%",background:respCor+"33",border:`1px solid ${respCor}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:respCor}}>{(resp.apelido||resp.name)[0]}</span>{resp.apelido||resp.name.split(" ")[0]}</span>}
                          {job&&<span style={{color:"#4D7CFE"}}>🎬 {job.desc}</span>}
                          {d.prazo&&<span style={{color:atrasada?"#ef4444":"#64748b",fontWeight:atrasada?700:400}}>⏰ {d.prazo}{atrasada?" (atrasada)":""}</span>}
                        </div>
                        {d.notes&&<div style={{fontSize:10,color:"#52525B",marginTop:4,paddingLeft:12}}>{d.notes}</div>}
                        <div style={{display:"flex",gap:4,marginTop:8,paddingLeft:12}}>
                          {st!=="a fazer"&&<button onClick={()=>moveDemand(d.id,-1)} title="Mover para trás" style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:11,borderRadius:5,padding:"3px 10px"}}>‹</button>}
                          {st!=="feito"&&<button onClick={()=>moveDemand(d.id,1)} title="Avançar" style={{background:"#22c55e22",border:"1px solid #22c55e44",color:"#22c55e",cursor:"pointer",fontSize:11,borderRadius:5,padding:"3px 10px",fontWeight:700}}>›</button>}
                          <div style={{flex:1}}/>
                          <button onClick={()=>startEdit("demand",d)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:11,borderRadius:5,padding:"3px 8px"}}>✏️</button>
                          <button onClick={()=>removeDemand(d.id)} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:13}}>✕</button>
                        </div>
                      </div>);
                    })}
                  </div>
                </div>);
              })}
            </div>
          </div>
        )}

        {/* ── PROFISSIONAIS ── */}
        {tab==="profissionais"&&(
          <div>
            <FormCard title="Cadastrar novo profissional" color="#4D7CFE">
              <Row><Input label="Nome completo" value={formFL.name} onChange={v=>setFormFL(p=>({...p,name:v}))}/><Input label="Apelido" value={formFL.apelido} onChange={v=>setFormFL(p=>({...p,apelido:v}))}/></Row>
              <Row><Input label="WhatsApp" value={formFL.phone} onChange={v=>setFormFL(p=>({...p,phone:v}))}/><Input label="E-mail" value={formFL.email} onChange={v=>setFormFL(p=>({...p,email:v}))}/></Row>
              <Row><Select label="Função" value={formFL.role} onChange={v=>setFormFL(p=>({...p,role:v}))} options={ROLES}/><Input label="Nascimento" value={formFL.nasc} onChange={v=>setFormFL(p=>({...p,nasc:v}))}/></Row>
              <Row><Input label="CPF" value={formFL.cpf} onChange={v=>setFormFL(p=>({...p,cpf:v}))}/><Input label="RG" value={formFL.rg} onChange={v=>setFormFL(p=>({...p,rg:v}))}/></Row>
              <AddBtn onClick={()=>{if(!formFL.name)return;setFreelancers(p=>[...p,{...formFL,id:uid()}]);setFormFL(emptyFL);}} color="#4D7CFE">+ Cadastrar</AddBtn>
            </FormCard>
            {freelancers.length===0&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhum profissional cadastrado ainda.</div>}
            {freelancers.length>0&&(
              <div>
                <h3 style={{fontSize:14,fontWeight:600,color:"#cbd5e1",margin:"0 0 12px"}}>Profissionais cadastrados ({freelancers.length})</h3>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[...freelancers].sort((a,b)=>{
                    const totalA=caches.filter(c=>c.freelancerId===a.id).reduce((s,c)=>s+cacheTotal(c),0);
                    const totalB=caches.filter(c=>c.freelancerId===b.id).reduce((s,c)=>s+cacheTotal(c),0);
                    return totalB-totalA;
                  }).map((fl)=>{
                    const idx=freelancers.findIndex(f=>f.id===fl.id);
                    const fc=caches.filter(c=>c.freelancerId===fl.id);const total=fc.reduce((s,c)=>s+cacheTotal(c),0);const cor=getColor(idx);
                    const isExpanded = expandedFLId===fl.id;
                    return(<div key={fl.id} style={{background:"#101014",border:`1px solid ${cor}22`,borderRadius:10,overflow:"hidden"}}>
                      <div onClick={()=>fc.length>0&&setExpandedFLId(p=>p===fl.id?null:fl.id)} style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:fc.length>0?"pointer":"default"}}>
                        <div style={{width:40,height:40,borderRadius:"50%",background:cor+"22",border:`2px solid ${cor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:cor,flexShrink:0}}>{fl.apelido?fl.apelido.slice(0,3):fl.name[0]}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{fl.name}{fl.apelido&&<span style={{color:cor,fontWeight:700}}> "{fl.apelido}"</span>}</div>
                          <div style={{fontSize:11,color:"#64748b",marginTop:1}}>{fl.role}{fl.phone?` · ${fl.phone}`:""}</div>
                          {fl.email&&<div style={{fontSize:10,color:"#475569"}}>{fl.email}</div>}
                          {fl.cpf&&<div style={{fontSize:10,color:"#334155"}}>CPF: {fl.cpf}{fl.rg?` · RG: ${fl.rg}`:""}</div>}
                        </div>
                        <div style={{textAlign:"right"}}>
                          {total>0&&<div style={{fontSize:13,fontWeight:700,color:"#f87171"}}>{formatBRL(total)}</div>}
                          <div style={{fontSize:11,color:fc.length>0?cor:"#475569",display:"flex",alignItems:"center",gap:3,justifyContent:"flex-end"}}>{fc.length} job(s){fc.length>0&&<span style={{fontSize:9}}>{isExpanded?"▲":"▼"}</span>}</div>
                        </div>
                        <button onClick={(e)=>{e.stopPropagation();startEdit("fl",fl);}} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                        <button onClick={(e)=>{e.stopPropagation();removeFreelancer(fl.id);}} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                      </div>
                      {isExpanded&&fc.length>0&&(
                        <div style={{padding:"0 16px 14px 16px",display:"flex",flexDirection:"column",gap:6}}>
                          {fc.map(c=>{
                            const job=jobs.find(j=>j.id===c.jobId);
                            const client=job?clients.find(cl=>cl.id===job.clientId):null;
                            const cTotal=cacheTotal(c);
                            return(<div key={c.id} style={{background:"#050507",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                              <div style={{width:6,height:6,borderRadius:"50%",background:cor,flexShrink:0}}/>
                              <div style={{flex:1}}>
                                <span style={{color:"#e2e8f0",fontWeight:500}}>{job?.desc||"—"}</span>
                                {client&&<span style={{color:"#64748b"}}> · {client.name}</span>}
                                {c.desc&&<span style={{color:"#475569"}}> — {c.desc}</span>}
                              </div>
                              <span style={{color:"#f87171",fontWeight:600}}>{formatBRL(cTotal)}</span>
                              <span style={{color:statusColor[c.status],fontSize:10}}>{c.status}</span>
                            </div>);
                          })}
                        </div>
                      )}
                    </div>);
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REEMBOLSOS ── */}
        {tab==="reimbursements"&&(
          <div>
            <p style={{fontSize:12,color:"#64748b",margin:"0 0 16px",background:"#fb923c0f",border:"1px solid #fb923c22",borderRadius:8,padding:"10px 14px"}}>
              💡 Estes valores já foram pagos do bolso (PF/PJ) como adiantamento. "Pendente" = ainda não foi reembolsado pela empresa. "Reembolsado" = a empresa já devolveu o valor — isso conta como saída no balanço.
            </p>
            <FormCard title="Adicionar Reembolso" color="#fb923c">
              <Row><Input label="Pessoa" value={formReim.pessoa} onChange={v=>setFormReim(p=>({...p,pessoa:v}))}/><Input label="Descrição" value={formReim.desc} onChange={v=>setFormReim(p=>({...p,desc:v}))}/></Row>
              <Row><Input label="Valor (R$)" type="number" value={formReim.value} onChange={v=>setFormReim(p=>({...p,value:v}))}/><Input label="Data de pagamento" type="date" value={formReim.datePay} onChange={v=>setFormReim(p=>({...p,datePay:v}))}/></Row>
              <Row><Select label="Tipo" value={formReim.tipo||"Adiantamento profissional"} onChange={v=>setFormReim(p=>({...p,tipo:v}))} options={REIMBURSEMENT_TYPES}/><Select label="Devolvido para" value={formReim.devolvidoPara} onChange={v=>setFormReim(p=>({...p,devolvidoPara:v}))} options={REIMB_SOURCES}/></Row>
              <Select label="Status" value={formReim.status} onChange={v=>setFormReim(p=>({...p,status:v}))} options={["pendente","recebido"]}/>
              <AddBtn onClick={addReimb} color="#fb923c">+ Adicionar</AddBtn>
            </FormCard>
            <SummaryPill label={`Total — ${formatBRL(totals.reimbPending)} ainda não reembolsado`} value={totals.totalReimb} color="#fb923c"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
              {REIMB_SOURCES.map(src=>{
                const pend=reimbursements.filter(r=>(r.devolvidoPara||"Frames")===src&&r.status==="pendente").reduce((s,r)=>s+Number(r.value),0);
                if(pend===0)return null;
                return(<div key={src} style={{background:"#fb923c10",border:"1px solid #fb923c22",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>A devolver p/ {src}</div><div style={{fontSize:15,fontWeight:700,color:"#fb923c"}}>{formatBRL(pend)}</div></div>);
              })}
            </div>
            {Object.entries(reimbByPerson).map(([pessoa,items])=>{
              const total=items.reduce((s,i)=>s+i.value,0);const cor=personColor[pessoa]||"#94a3b8";
              return(<div key={pessoa} style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:13,fontWeight:700,color:cor}}>{pessoa}</span><span style={{fontSize:12,color:"#475569"}}>—</span><span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{formatBRL(total)}</span></div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {items.map(item=>(
                    <div key={item.id} style={{background:"#101014",border:`1px solid ${cor}22`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:500,color:"#e2e8f0"}}>{item.desc}</div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:2,display:"flex",gap:8}}>
                          {item.devolvidoPara&&<span>🔁 Devolvido p/ <span style={{color:"#fb923c",fontWeight:600}}>{item.devolvidoPara}</span></span>}
                          {item.datePay&&<span>💰 {item.datePay}</span>}
                        </div>
                      </div>
                      <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}</div>
                      <button onClick={()=>toggleStatus(reimbursements,setReimbursements,item.id,["pendente","recebido"])} style={{background:statusColor[item.status]+"22",color:statusColor[item.status],border:`1px solid ${statusColor[item.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.status==="recebido"?"reembolsado":item.status}</button>
                      <button onClick={()=>startEdit("reimb",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                      <button onClick={()=>setReimbursements(p=>p.filter(e=>e.id!==item.id))} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>);
            })}
          </div>
        )}

        {/* ── GASTOS GERAIS ── */}
        {tab==="expenses"&&(
          <div>
            <FormCard title="Adicionar Gasto Geral" color="#f87171">
              <Input label="Descrição" value={formE.desc} onChange={v=>setFormE(p=>({...p,desc:v}))}/>
              <Row><Input label="Valor total (R$)" type="number" value={formE.value} onChange={v=>setFormE(p=>({...p,value:v}))}/><Select label="Categoria" value={formE.category} onChange={v=>setFormE(p=>({...p,category:v}))} options={CATEGORIES_EXPENSE}/></Row>
              <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>💳 De onde saiu o dinheiro</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{PAYMENT_SOURCES.map(s=>{const cor=SOURCE_COLOR[s]||"#94a3b8";const sel=formE.source===s;return(<button key={s} onClick={()=>setFormE(p=>({...p,source:s}))} style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",background:sel?cor:cor+"22",color:sel?"#000":cor,border:`1px solid ${cor}66`}}>{s}</button>);})}</div>
              </div>
              <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Forma de pagamento</div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  {["à vista","parcelado"].map(pt=>(<button key={pt} onClick={()=>setFormE(p=>({...p,paymentType:pt,parcelas:pt==="à vista"?"1":(p.parcelas==="1"?"2":p.parcelas)}))} style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:formE.paymentType===pt?"#4D7CFE":"#4D7CFE22",color:formE.paymentType===pt?"#fff":"#4D7CFE"}}>{pt==="à vista"?"💵 À vista":"📆 Parcelado"}</button>))}
                  {formE.paymentType==="parcelado"&&<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:"#64748b"}}>Em</span><select value={formE.parcelas} onChange={e=>setFormE(p=>({...p,parcelas:e.target.value}))} style={{background:"#050507",border:"1px solid #ffffff20",borderRadius:6,padding:"4px 8px",color:"#e2e8f0",fontSize:12}}>{["2","3","4","5","6","7","8","9","10","11","12","15","18","24"].map(n=><option key={n}>{n}</option>)}</select><span style={{fontSize:12,color:"#64748b"}}>vezes</span></div>}
                </div>
              </div>
              {formE.paymentType==="parcelado"&&<Row><Input label="Quantas parcelas já pagou" type="number" value={formE.parcelasPagas} onChange={v=>setFormE(p=>({...p,parcelasPagas:v}))}/><Input label="📅 Data do gasto" type="date" value={formE.dateWork} onChange={v=>setFormE(p=>({...p,dateWork:v}))}/></Row>}
              {formE.paymentType==="à vista"&&<Row><Input label="📅 Data do gasto" type="date" value={formE.dateWork} onChange={v=>setFormE(p=>({...p,dateWork:v}))}/><Select label="Status" value={formE.status} onChange={v=>setFormE(p=>({...p,status:v}))} options={["a pagar","pago"]}/></Row>}
              <Row>
                <Select label="Natureza" value={formE.natureza||"overhead"} onChange={v=>setFormE(p=>({...p,natureza:v,jobId:v==="overhead"?"":p.jobId}))} options={["overhead","vinculado a job"]}/>
                {(formE.natureza==="vinculado a job")&&<div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Job</div><select value={formE.jobId||""} onChange={e=>setFormE(p=>({...p,jobId:Number(e.target.value)}))} style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}><option value="">Selecione...</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.desc}</option>)}</select></div>}
              </Row>
              <AddBtn onClick={addExpense}>+ Adicionar</AddBtn>
            </FormCard>
            <SummaryPill label={`Total — ${formatBRL(totals.paidExpenses)} pagos · ${formatBRL(totals.totalExpenses-totals.paidExpenses)} a pagar`} value={totals.totalExpenses} color="#f87171"/>
            {expenses.length===0&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhum gasto lançado ainda.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...expenses].reverse().map(item=>{
                const parcelas=Number(item.parcelas||1);const pagas=Number(item.parcelasPagas||0);const isParcelado=item.paymentType==="parcelado"&&parcelas>1;
                const valorParcela=Number(item.value)/parcelas;const jaPago=isParcelado?valorParcela*pagas:(item.status==="pago"?Number(item.value):0);const falta=Number(item.value)-jaPago;
                const cor=SOURCE_COLOR[item.source]||"#94a3b8";
                return(<div key={item.id} style={{background:"#101014",border:"1px solid #18181D",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:500,color:"#e2e8f0"}}>{item.desc}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.category}{item.source&&<span style={{color:cor}}> · 💳 {item.source}</span>}{item.dateWork&&` · 📅 ${item.dateWork}`}{item.jobId&&<span style={{color:"#4D7CFE"}}> · {jobs.find(j=>j.id===item.jobId)?.desc||""}</span>}{isParcelado&&<span style={{color:"#4D7CFE"}}> · 📆 {parcelas}x de {formatBRL(valorParcela)}</span>}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}</div>
                    {!isParcelado&&<button onClick={()=>toggleStatus(expenses,setExpenses,item.id,["a pagar","pago"])} style={{background:statusColor[item.status]+"22",color:statusColor[item.status],border:`1px solid ${statusColor[item.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.status}</button>}
                    <button onClick={()=>duplicateExpense(item)} title="Duplicar" style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>⧉</button>
                    <button onClick={()=>startEdit("exp",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                    <button onClick={()=>{if(confirmDelete(`Remover gasto "${item.desc}"?`))setExpenses(p=>p.filter(e=>e.id!==item.id));}} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                  </div>
                  {isParcelado&&(
                    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #ffffff08"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#64748b"}}>Parcelas pagas: <span style={{color:"#22c55e",fontWeight:700}}>{pagas}</span> / {parcelas}</span>
                        <div style={{display:"flex",gap:6}}>
                          <span style={{fontSize:11,color:"#22c55e"}}>✅ {formatBRL(jaPago)} pago</span>
                          <span style={{fontSize:11,color:"#f59e0b"}}>⏳ {formatBRL(falta)} falta</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                        <div style={{flex:1,height:6,background:"#050507",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(pagas/parcelas)*100}%`,height:"100%",background:"linear-gradient(90deg,#22c55e,#4ade80)",borderRadius:3}}/></div>
                        <button onClick={()=>setExpenses(p=>p.map(e=>e.id===item.id?{...e,parcelasPagas:String(Math.max(0,pagas-1)),status:(pagas-1>=parcelas)?"pago":"a pagar"}:e))} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:14,borderRadius:6,padding:"2px 10px",fontWeight:700}}>−</button>
                        <button onClick={()=>setExpenses(p=>p.map(e=>e.id===item.id?{...e,parcelasPagas:String(Math.min(parcelas,pagas+1)),status:(pagas+1>=parcelas)?"pago":"a pagar"}:e))} style={{background:"#22c55e22",border:"1px solid #22c55e44",color:"#22c55e",cursor:"pointer",fontSize:14,borderRadius:6,padding:"2px 10px",fontWeight:700}}>+</button>
                      </div>
                      {(()=>{const dates=item.parcelaDates||[];const nextDate=dates[pagas];const remaining=dates.slice(pagas);if(!nextDate)return null;return(<div style={{fontSize:10,color:"#64748b",display:"flex",flexWrap:"wrap",gap:4}}>
                        <span style={{color:"#f59e0b",fontWeight:600}}>Próxima: {nextDate}</span>
                        {remaining.length>1&&remaining.slice(1,4).map((d,i)=><span key={i} style={{background:"#ffffff08",borderRadius:4,padding:"1px 6px"}}>{d}</span>)}
                        {remaining.length>4&&<span style={{color:"#475569"}}>+{remaining.length-4} mais</span>}
                      </div>);})()}
                    </div>
                  )}
                </div>);
              })}
            </div>
          </div>
        )}

        {/* ── ESTÚDIO (despesas fixas: aluguel, internet, energia...) ── */}
        {tab==="studio"&&(
          <div>
            <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Despesas fixas do estúdio: aluguel, internet, energia, água, condomínio...</p>
            <button onClick={()=>setShowAddStudio(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddStudio?"#101014":"#22d3ee22",border:"1px solid #22d3ee44",borderRadius:10,color:"#22d3ee",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddStudio?"▲ Fechar":"＋ Adicionar despesa fixa"}</button>
            {showAddStudio&&(
              <FormCard title="Nova Despesa do Estúdio" color="#22d3ee">
                <Input label="Descrição (ex: Conta de luz)" value={formStudio.desc} onChange={v=>setFormStudio(p=>({...p,desc:v}))}/>
                <Row><Input label="Valor deste mês (R$)" type="number" value={formStudio.value} onChange={v=>setFormStudio(p=>({...p,value:v}))}/><Select label="Categoria" value={formStudio.category} onChange={v=>setFormStudio(p=>({...p,category:v}))} options={STUDIO_CATEGORIES}/></Row>
                <Row><Input label="Dia do vencimento (1-31)" type="number" value={formStudio.dayOfMonth} onChange={v=>setFormStudio(p=>({...p,dayOfMonth:v}))}/><Input label="Ativo desde" type="date" value={formStudio.dateStart} onChange={v=>setFormStudio(p=>({...p,dateStart:v}))}/></Row>
                <p style={{fontSize:11,color:"#475569",margin:0}}>💡 Estas despesas se repetem todo mês mas o valor pode variar. Depois de criar, você lança o valor de cada mês no histórico.</p>
                <AddBtn onClick={addStudioExpense} color="#22d3ee">+ Adicionar</AddBtn>
              </FormCard>
            )}
            {studioExpenses.length>0&&<SummaryPill label="Total do mês mais recente de cada despesa" value={studioExpenses.filter(e=>e.active!==false).reduce((s,e)=>s+studioLatestValue(e),0)} color="#22d3ee"/>}
            {studioExpenses.length===0&&!showAddStudio&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhuma despesa fixa cadastrada ainda.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {studioExpenses.map(item=>{
                const isExp=expandedStudio===item.id;
                const latestMonth=studioLatestMonth(item);
                const months=Object.keys(item.monthly||{}).sort().reverse();
                return(<div key={item.id} style={{background:"#101014",border:"1px solid #18181D",borderRadius:10,padding:"14px 16px",opacity:item.active===false?0.5:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:18}}>🏢</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:500,color:"#e2e8f0"}}>{item.desc}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.category}{item.dayOfMonth&&` · vence dia ${item.dayOfMonth}`}{latestMonth&&<span> · último: {monthLabel(latestMonth)}</span>}{item.active===false&&<span style={{color:"#f59e0b"}}> · inativo</span>}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(studioLatestValue(item))}<span style={{fontSize:10,color:"#64748b",fontWeight:400}}>/mês</span></div>
                    <button onClick={()=>{setExpandedStudio(isExp?null:item.id);setNewMonthKey(today().slice(0,7));setNewMonthVal("");}} title="Histórico mensal" style={{background:isExp?"#22d3ee22":"#ffffff10",border:"none",color:isExp?"#22d3ee":"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 10px"}}>📅 {months.length}</button>
                    <button onClick={()=>setStudioExpenses(p=>p.map(e=>e.id===item.id?{...e,active:e.active===false?true:false}:e))} style={{background:item.active===false?"#64748b22":"#22c55e22",color:item.active===false?"#64748b":"#22c55e",border:`1px solid ${item.active===false?"#64748b44":"#22c55e44"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.active===false?"inativo":"ativo"}</button>
                    <button onClick={()=>startEdit("studio",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                    <button onClick={()=>removeStudioExpense(item.id)} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                  </div>
                  {isExp&&(
                    <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #ffffff08"}}>
                      <div style={{fontSize:11,color:"#64748b",marginBottom:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"1px"}}>Histórico mensal</div>
                      <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:12,flexWrap:"wrap"}}>
                        <div><div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Mês</div><input type="month" value={newMonthKey} onChange={e=>setNewMonthKey(e.target.value)} style={{background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:12,outline:"none"}}/></div>
                        <div><div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Valor (R$)</div><input type="number" value={newMonthVal} onChange={e=>setNewMonthVal(e.target.value)} placeholder="0,00" style={{width:110,background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:12,outline:"none"}}/></div>
                        <button onClick={()=>{if(newMonthKey&&newMonthVal!==""){setStudioMonthValue(item.id,newMonthKey,newMonthVal);setNewMonthVal("");}}} style={{background:"#22d3ee",color:"#000",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Lançar mês</button>
                      </div>
                      {months.length===0&&<div style={{fontSize:12,color:"#475569"}}>Nenhum mês lançado ainda.</div>}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {months.map(mk=>(<div key={mk} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#0A0A0D",borderRadius:8,padding:"8px 12px"}}>
                          <span style={{fontSize:13,color:"#cbd5e1"}}>{monthLabel(mk)}</span>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span className="mono" style={{fontSize:14,fontWeight:600,color:"#22d3ee"}}>{formatBRL(item.monthly[mk])}</span>
                            <button onClick={()=>setStudioMonthValue(item.id,mk,"")} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:14}}>✕</button>
                          </div>
                        </div>))}
                      </div>
                      {months.length>1&&<div style={{marginTop:10,fontSize:11,color:"#64748b"}}>Média: <span className="mono" style={{color:"#94a3b8",fontWeight:600}}>{formatBRL(months.reduce((s,mk)=>s+Number(item.monthly[mk]),0)/months.length)}</span></div>}
                    </div>
                  )}
                </div>);
              })}
            </div>
          </div>
        )}

        {/* ── ASSINATURAS (SaaS: Figma, Claude, Adobe...) ── */}
        {tab==="subscriptions"&&(
          <div>
            <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Assinaturas e ferramentas: Figma, Claude, Adobe, softwares em geral...</p>
            <button onClick={()=>setShowAddSub(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddSub?"#101014":"#facc1522",border:"1px solid #facc1544",borderRadius:10,color:"#facc15",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddSub?"▲ Fechar":"＋ Adicionar assinatura"}</button>
            {showAddSub&&(
              <FormCard title="Nova Assinatura" color="#facc15">
                <Input label="Nome (ex: Figma, Claude Pro)" value={formSub.desc} onChange={v=>setFormSub(p=>({...p,desc:v}))}/>
                <Row><Input label="Valor (R$)" type="number" value={formSub.value} onChange={v=>setFormSub(p=>({...p,value:v}))}/><Select label="Categoria" value={formSub.category} onChange={v=>setFormSub(p=>({...p,category:v}))} options={SUB_CATEGORIES}/></Row>
                <Row><Select label="Cobrança" value={formSub.cycle} onChange={v=>setFormSub(p=>({...p,cycle:v}))} options={BILLING_CYCLES}/><Input label="Dia da cobrança (1-31)" type="number" value={formSub.dayOfMonth} onChange={v=>setFormSub(p=>({...p,dayOfMonth:v}))}/></Row>
                <Input label="Ativo desde" type="date" value={formSub.dateStart} onChange={v=>setFormSub(p=>({...p,dateStart:v}))}/>
                <AddBtn onClick={addSubscription} color="#facc15">+ Adicionar</AddBtn>
              </FormCard>
            )}
            {subscriptions.length>0&&(()=>{
              const monthlyTotal=subscriptions.filter(s=>s.active!==false).reduce((s,e)=>s+(e.cycle==="anual"?Number(e.value)/12:Number(e.value)),0);
              return <SummaryPill label="Total mensal equivalente (anuais divididas por 12)" value={monthlyTotal} color="#facc15"/>;
            })()}
            {subscriptions.length===0&&!showAddSub&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhuma assinatura cadastrada ainda.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {subscriptions.map(item=>(<div key={item.id} style={{background:"#101014",border:"1px solid #18181D",borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:10,opacity:item.active===false?0.5:1}}>
                <span style={{fontSize:18}}>🔁</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:500,color:"#e2e8f0"}}>{item.desc}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.category} · {item.cycle}{item.dayOfMonth&&` · dia ${item.dayOfMonth}`}{item.active===false&&<span style={{color:"#f59e0b"}}> · inativo</span>}</div>
                </div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}<span style={{fontSize:10,color:"#64748b",fontWeight:400}}>/{item.cycle==="anual"?"ano":"mês"}</span></div>
                <button onClick={()=>setSubscriptions(p=>p.map(e=>e.id===item.id?{...e,active:e.active===false?true:false}:e))} style={{background:item.active===false?"#64748b22":"#22c55e22",color:item.active===false?"#64748b":"#22c55e",border:`1px solid ${item.active===false?"#64748b44":"#22c55e44"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.active===false?"inativo":"ativo"}</button>
                <button onClick={()=>startEdit("sub",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>removeSubscription(item.id)} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
              </div>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tela de login ──
function LoginScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const errorMessages = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tente entrar em vez de criar conta.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      onLoginSuccess();
    } catch (err) {
      setError(errorMessages[err.code] || `Erro ao entrar: ${err.code || err.message}`);
    }
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("As senhas não são iguais.");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      onLoginSuccess();
    } catch (err) {
      setError(errorMessages[err.code] || `Erro ao criar conta: ${err.code || err.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{fontFamily:"'Space Grotesk','Inter',sans-serif",background:"#050507",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,position:"relative",overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>
      <div style={{position:"absolute",top:"-30%",left:"50%",transform:"translateX(-50%)",width:900,height:600,background:"radial-gradient(ellipse at center, #4D7CFE22 0%, #8B5CF610 40%, transparent 65%)",pointerEvents:"none"}}/>
      <form onSubmit={mode==="login"?handleLogin:handleSignup} style={{background:"linear-gradient(180deg,#101016 0%,#0C0C10 100%)",border:"1px solid #232330",borderRadius:12,padding:36,width:"100%",maxWidth:380,position:"relative",boxShadow:"0 24px 80px #00000066, 0 0 60px #4D7CFE0D"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <h1 style={{margin:0,fontSize:24,fontWeight:700,color:"#fff",letterSpacing:"-0.5px"}}>FRAMES<span style={{color:"#4D7CFE"}}>/</span>BR</h1>
          <p style={{margin:"6px 0 0",fontSize:10,color:"#52525B",fontFamily:"'JetBrains Mono',monospace",letterSpacing:"3px",textTransform:"uppercase"}}>Financial System</p>
          <p style={{margin:"14px 0 0",fontSize:12,color:"#71717A"}}>{mode==="login"?"Faça login para continuar":"Crie sua conta gratuita"}</p>
        </div>
        <div style={{display:"flex",gap:4,background:"#050507",borderRadius:8,padding:4,marginBottom:20}}>
          <button type="button" onClick={()=>{setMode("login");setError("");}} style={{flex:1,padding:"8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:mode==="login"?"#4D7CFE":"transparent",color:mode==="login"?"#fff":"#64748b"}}>Entrar</button>
          <button type="button" onClick={()=>{setMode("signup");setError("");}} style={{flex:1,padding:"8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:mode==="signup"?"#4D7CFE":"transparent",color:mode==="signup"?"#fff":"#64748b"}}>Criar conta</button>
        </div>
        {error && <div style={{background:"#ef444415",border:"1px solid #ef444444",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#fca5a5"}}>{error}</div>}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>E-mail</div>
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"
            style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:mode==="signup"?12:20}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Senha</div>
          <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" minLength={mode==="signup"?6:undefined}
            style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {mode==="signup" && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Confirmar senha</div>
            <input type="password" required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="••••••••"
              style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
        )}
        <button type="submit" disabled={loading} style={{width:"100%",background:"linear-gradient(135deg,#4D7CFE 0%,#8B5CF6 100%)",boxShadow:"0 4px 20px #4D7CFE33",color:"#fff",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:600,cursor:loading?"default":"pointer",opacity:loading?0.6:1}}>
          {loading?(mode==="login"?"Entrando...":"Criando conta..."):(mode==="login"?"Entrar":"Criar conta")}
        </button>
        {mode==="signup" && <p style={{margin:"14px 0 0",fontSize:11,color:"#475569",textAlign:"center"}}>Sua conta começa com dados em branco, separados de qualquer outra conta.</p>}
      </form>
    </div>
  );
}

// ── Wrapper que controla se mostra login ou o sistema ──
export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out, object = logged in

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      currentUid = u ? u.uid : null; // define para qual "gaveta" de dados este login aponta
      setUser(u || null);
    });
    return () => unsub();
  }, []);

  if (user === undefined) {
    return (
      <div style={{fontFamily:"'Inter',sans-serif",background:"#050507",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",marginBottom:10}}>FRAMES<span style={{color:"#4D7CFE"}}>/</span>BR</div><div style={{fontSize:12,color:"#52525B"}}>Verificando login…</div></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={() => {}} />;
  }

  // key={user.uid} força recriar o AppContent do zero ao trocar de conta,
  // evitando que dados de um usuário fiquem "grudados" na tela ao trocar de login.
  return <AppContent key={user.uid} onLogout={() => signOut(auth)} userEmail={user.email} />;
}



function EditModal({fields,editData,setEditData,onSave,onCancel,color="#4D7CFE"}){
  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#101014",border:`1px solid ${color}44`,borderRadius:12,padding:24,width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto"}}>
        <h3 style={{margin:"0 0 16px",fontSize:15,fontWeight:700,color}}>✏️ Editar</h3>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {fields.map(f=>(f.type==="select"
            ?<div key={f.key}><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{f.label}</div>
              <select value={editData[f.key]||""} onChange={e=>setEditData(p=>({...p,[f.key]:e.target.value}))} style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}>{f.options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}</select></div>
            :<div key={f.key}><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{f.label}</div>
              <input type={f.type||"text"} value={editData[f.key]||""} onChange={e=>setEditData(p=>({...p,[f.key]:e.target.value}))} style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button onClick={onSave} style={{flex:1,background:color,color:"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>💾 Salvar</button>
          <button onClick={onCancel} style={{flex:1,background:"#ffffff10",color:"#94a3b8",border:"none",borderRadius:8,padding:"10px",fontSize:13,cursor:"pointer"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
function SummaryPill({label,value,color}){return(<div style={{background:color+"15",border:`1px solid ${color}33`,borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:"#94a3b8"}}>{label}</span><span style={{fontSize:16,fontWeight:700,color}}>{Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span></div>);}
function FormCard({title,color,children}){return(<div style={{background:"#101014",border:`1px solid ${color}22`,borderRadius:10,padding:20,marginBottom:20}}><h3 style={{margin:"0 0 16px",fontSize:14,fontWeight:600,color}}>{title}</h3><div style={{display:"flex",flexDirection:"column",gap:10}}>{children}</div></div>);}
function Row({children}){return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{children}</div>;}
function Input({label,value,onChange,type="text"}){return(<div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{label}</div><input type={type} value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>);}
function Select({label,value,onChange,options}){return(<div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{label}</div><select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:"#050507",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}>{options.map(o=><option key={String(o)} value={o}>{o}</option>)}</select></div>);}
function AddBtn({onClick,color="#f87171",children}){const isAccent=color==="#4D7CFE";return(<button onClick={onClick} className={isAccent?"btn-primary":undefined} style={{background:isAccent?undefined:color,color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:4}}>{children}</button>);}
