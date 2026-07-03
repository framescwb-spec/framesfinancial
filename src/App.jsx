import { useState, useMemo, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

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
const EXPENSE_TYPES = ["Logística","Alimentação","Uber","Voo","Gasolina","Gastos extras","Outro"];
const PAYMENT_SOURCES = ["Cartão Frames","Cartão Japa","Cartão Ivan","Dinheiro","Pix/Transferência"];
const CATEGORIES_EXPENSE = ["Equipamento","Software","Marketing","Pessoal","Aluguel","Transporte","Outros"];
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const REIMB_SOURCES = ["Frames","Ivan","Japa"];

const formatBRL = (v) => Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const today = () => new Date().toISOString().split("T")[0];
const AVATAR_COLORS = ["#818cf8","#fb923c","#f472b6","#34d399","#22d3ee","#facc15","#a78bfa","#f87171","#4ade80","#38bdf8"];
const getColor = (idx) => AVATAR_COLORS[Math.abs(idx) % AVATAR_COLORS.length];
const SOURCE_COLOR = {"Cartão Frames":"#facc15","Cartão Japa":"#22d3ee","Cartão Ivan":"#f472b6","Dinheiro":"#34d399","Pix/Transferência":"#818cf8"};
const TYPE_ICON = {"Logística":"🚛","Alimentação":"🍽️","Uber":"🚗","Voo":"✈️","Gasolina":"⛽","Gastos extras":"💳","Outro":"📦"};
const monthKey = (d) => d ? d.slice(0,7) : null;
const monthLabel = (key) => { if(!key) return "—"; const [y,m]=key.split("-"); return `${MONTHS_PT[parseInt(m)-1]}/${y}`; };

// ── Default data ──
// CLIENTS: empresas/pessoas que contratam. JOBS: projetos/trabalhos que pertencem a um cliente.
const DEFAULT_CLIENTS = [
  {id:1,name:"Corpus Christi"},
  {id:2,name:"Coolritiba"},
  {id:3,name:"CBDE"},
  {id:4,name:"NP"},
  {id:5,name:"CVS"},
  {id:6,name:"GINGA"},
  {id:7,name:"Cruzeiro do Sul"},
  {id:8,name:"DVD Bruno e Marrone"},
  {id:9,name:"CWB Brasil"},
];

const DEFAULT_JOBS = [
  {id:101,clientId:1,desc:"Corpus Christi",value:15900,valorRecebido:0,nfRate:0.12,dateWork:"",dateDueExpected:"",status:"fechado"},
  {id:102,clientId:2,desc:"Coolritiba",value:17000,valorRecebido:0,nfRate:0.12,dateWork:"",dateDueExpected:"",status:"fechado"},
  {id:103,clientId:3,desc:"CBDE",value:19000,valorRecebido:0,nfRate:0.12,dateWork:"",dateDueExpected:"",status:"fechado"},
  {id:104,clientId:4,desc:"NP",value:37000,valorRecebido:0,nfRate:0.12,dateWork:"",dateDueExpected:"",status:"fechado"},
  {id:105,clientId:5,desc:"CVS",value:32000,valorRecebido:0,nfRate:0.12,dateWork:"",dateDueExpected:"2026-06-30",status:"fechado"},
  {id:106,clientId:9,desc:"GINGA",value:22000,valorRecebido:0,nfRate:0.12,dateWork:"",dateDueExpected:"",status:"fechado"},
  {id:107,clientId:7,desc:"RIO2C",value:17900,valorRecebido:0,nfRate:0.12,dateWork:"2026-06-01",dateDueExpected:"2026-06-30",status:"fechado"},
];

const DEFAULT_REIMBURSEMENTS = [
  {id:201,pessoa:"Yago",desc:"CBDE",value:2000,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:202,pessoa:"Yago",desc:"COOLRITIBA",value:1200,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:203,pessoa:"Yago",desc:"CORPUS CHRISTI",value:1200,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:204,pessoa:"Graba",desc:"Coolritiba",value:700,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:205,pessoa:"Graba",desc:"DVD Bruno e Marrone",value:500,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:206,pessoa:"Graba",desc:"Corpus Christi",value:550,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:207,pessoa:"Maria",desc:"Coolritiba",value:350,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:208,pessoa:"Maria",desc:"Logística NP",value:100,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:209,pessoa:"Patrocinado",desc:"Coolritiba",value:150,devolvidoPara:"Frames",datePay:"",status:"pendente"},
  {id:210,pessoa:"Cartão Japa",desc:"Parcela junho",value:1161,devolvidoPara:"Japa",datePay:"2026-06-30",status:"pendente"},
  {id:211,pessoa:"Cartão Frames",desc:"Parcela julho",value:5340,devolvidoPara:"Frames",datePay:"2026-07-30",status:"pendente"},
];

const DEFAULT_FREELANCERS = [
  {id:1,name:"Guilherme Felipe da Silva Filho",role:"Diretor",phone:"(41) 998549018",email:"estudioabertobr@gmail.com",cpf:"000.003.741-99",rg:"73822530 MG",nasc:"19/12/1982",apelido:"XAC"},
  {id:2,name:"Paulo Guilherme Grabarski de Almeida",role:"Cinegrafista",phone:"(41) 98842-2252",email:"paulgrabarski@gmail.com",cpf:"118.646.279-56",rg:"13.353.125-4",nasc:"26/08/2000",apelido:"GRABA"},
  {id:3,name:"Yago Cruz Castanho",role:"Cinegrafista",phone:"(41) 99978-9683",email:"yago.castanho@gmail.com",cpf:"087.818.489-94",rg:"12.650.210-9",nasc:"07/02/1994",apelido:"YAGO"},
  {id:4,name:"Gustavo Gama Nunes",role:"Outro",phone:"(41) 99683-4246",email:"",cpf:"125.160.179-01",rg:"",nasc:"",apelido:"GAMA"},
  {id:5,name:"Maria Eduarda Morais de Souza",role:"Produtora",phone:"(41) 996420136",email:"mariaaesouza31@icloud.com",cpf:"146.234.409-74",rg:"",nasc:"31/07/2004",apelido:"MARIA"},
  {id:6,name:"Wystenio da Silveira da Silva",role:"Outro",phone:"89988237319",email:"Wystenio@gmail.com",cpf:"617.456.203-46",rg:"08110291480",nasc:"10/10/2000",apelido:"WYS"},
  {id:7,name:"Jeferson Pereira dos Santos",role:"Outro",phone:"43 996605174",email:"jefersonps2612@gmail.com",cpf:"080.831.449-16",rg:"124630169",nasc:"08/10/1993",apelido:"JEFF"},
  {id:8,name:"Marcos Vinícius Silva Gonçalves",role:"Outro",phone:"",email:"contato.sawrus@gmail.com",cpf:"126.680.659-84",rg:"140675415",nasc:"17/12/2003",apelido:"MARCOS"},
  {id:9,name:"Bruno FPV",role:"Drone",phone:"",email:"",cpf:"",rg:"",nasc:"",apelido:"BRUNO FPV"},
  {id:10,name:"Ivan",role:"Cinegrafista",phone:"",email:"",cpf:"",rg:"",nasc:"",apelido:"IVAN"},
  {id:11,name:"Japa",role:"Cinegrafista",phone:"",email:"",cpf:"",rg:"",nasc:"",apelido:"JAPA"},
  {id:12,name:"João Valeriote",role:"Outro",phone:"",email:"",cpf:"",rg:"",nasc:"",apelido:"VALERIOTE"},
];

// Caches & ProjectExpenses now reference jobId instead of project name
const DEFAULT_CACHES = [
  {id:901,freelancerId:2,jobId:107,role:"Cinegrafista",value:2400,alimentacao:200,logistica:0,dateWork:"2026-06-01",dateDue:"",status:"a pagar"},
  {id:902,freelancerId:1,jobId:107,role:"Editor",value:1200,alimentacao:0,logistica:0,dateWork:"2026-06-01",dateDue:"",status:"a pagar"},
  {id:910,freelancerId:11,jobId:104,role:"Cinegrafista",value:0,alimentacao:0,logistica:4408,dateWork:"",dateDue:"",status:"a pagar"},
  {id:911,freelancerId:10,jobId:104,role:"Cinegrafista",value:0,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:912,freelancerId:7,jobId:104,role:"Outro",value:2200,alimentacao:0,logistica:762,dateWork:"",dateDue:"",status:"a pagar"},
  {id:913,freelancerId:3,jobId:104,role:"Cinegrafista",value:3600,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:914,freelancerId:1,jobId:104,role:"Diretor",value:3500,alimentacao:0,logistica:404,dateWork:"",dateDue:"",status:"a pagar"},
  {id:915,freelancerId:2,jobId:104,role:"Cinegrafista",value:2800,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:916,freelancerId:5,jobId:104,role:"Produtora",value:1200,alimentacao:0,logistica:802,dateWork:"",dateDue:"",status:"a pagar"},
  {id:920,freelancerId:9,jobId:101,role:"Drone",value:1200,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:921,freelancerId:11,jobId:101,role:"Cinegrafista",value:1500,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:922,freelancerId:10,jobId:101,role:"Cinegrafista",value:1500,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:923,freelancerId:3,jobId:101,role:"Cinegrafista",value:1200,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:924,freelancerId:4,jobId:101,role:"Editor",value:1000,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
  {id:925,freelancerId:2,jobId:101,role:"Assistente",value:400,alimentacao:0,logistica:0,dateWork:"",dateDue:"",status:"a pagar"},
];

const DEFAULT_PROJ_EXPENSES = [
  {id:801,jobId:107,type:"Voo",desc:"1/2 frames (x2)",value:523,source:"Cartão Frames",paymentType:"à vista",parcelas:"2",dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:802,jobId:107,type:"Alimentação",desc:"Ivan",value:300,source:"Cartão Ivan",paymentType:"à vista",parcelas:"2",dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:803,jobId:107,type:"Gastos extras",desc:"Videomaker Ivan",value:3000,source:"Cartão Ivan",paymentType:"à vista",parcelas:"2",dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:804,jobId:107,type:"Gastos extras",desc:"Hotel Ivan",value:771,source:"Cartão Frames",paymentType:"à vista",parcelas:"2",dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:805,jobId:107,type:"Gastos extras",desc:"Hotel Pia",value:321,source:"Cartão Frames",paymentType:"à vista",parcelas:"2",dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:806,jobId:107,type:"Uber",desc:"",value:211,source:"Cartão Frames",paymentType:"à vista",parcelas:"2",dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:807,jobId:107,type:"Alimentação",desc:"",value:68,source:"Cartão Frames",paymentType:"à vista",parcelas:"2",dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:821,jobId:101,type:"Alimentação",desc:"Geral equipe",value:500,source:"Dinheiro",paymentType:"à vista",parcelas:"1",dateWork:"",datePay:"",status:"a pagar"},
  {id:822,jobId:101,type:"Alimentação",desc:"Pizza e Gole",value:92,source:"Dinheiro",paymentType:"à vista",parcelas:"1",dateWork:"",datePay:"",status:"a pagar"},
];

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
        clients: saved.clients ?? defaults.clients,
        jobs: saved.jobs ?? defaults.jobs,
        reimbursements: saved.reimbursements ?? defaults.reimbursements,
        freelancers: saved.freelancers ?? defaults.freelancers,
        caches: saved.caches ?? defaults.caches,
        projectExpenses: saved.projectExpenses ?? defaults.projectExpenses,
        studioExpenses: saved.studioExpenses ?? [],
        subscriptions: saved.subscriptions ?? [],
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
      return migrated;
    }
  } catch(e) { console.error("Erro na migração de dados antigos:", e); }

  return { ...defaults, studioExpenses: [], subscriptions: [] };
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
  const [diagResult, setDiagResult] = useState(null); // {ok, msg}
  const [diagRunning, setDiagRunning] = useState(false);
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
  const [clients, setClients] = useState(DEFAULT_CLIENTS);
  const [jobs, setJobs] = useState(DEFAULT_JOBS);
  const [reimbursements, setReimbursements] = useState(DEFAULT_REIMBURSEMENTS);
  const [freelancers, setFreelancers] = useState(DEFAULT_FREELANCERS);
  const [caches, setCaches] = useState(DEFAULT_CACHES);
  const [projectExpenses, setProjectExpenses] = useState(DEFAULT_PROJ_EXPENSES);
  const [studioExpenses, setStudioExpenses] = useState(DEFAULT_STUDIO_EXPENSES);
  const [subscriptions, setSubscriptions] = useState(DEFAULT_SUBSCRIPTIONS);

  useEffect(() => {
    loadFromStorage({
      expenses: [], clients: DEFAULT_CLIENTS, jobs: DEFAULT_JOBS,
      reimbursements: DEFAULT_REIMBURSEMENTS, freelancers: DEFAULT_FREELANCERS,
      caches: DEFAULT_CACHES, projectExpenses: DEFAULT_PROJ_EXPENSES,
    }).then(data => {
      setExpenses(data.expenses);

      const savedClientIds = new Set(data.clients.map(c => c.id));
      let mergedClients = [...data.clients, ...DEFAULT_CLIENTS.filter(c => !savedClientIds.has(c.id))];
      const savedJobIds = new Set(data.jobs.map(j => j.id));
      let mergedJobs = [...data.jobs, ...DEFAULT_JOBS.filter(j => !savedJobIds.has(j.id))];

      // Fix duplicate "Cruzeiro do Sul": an earlier auto-fix may have already renamed client id 7
      // (originally "RIO2C") to "Cruzeiro do Sul", creating a duplicate alongside the user's
      // original client. Detect ANY duplicate "Cruzeiro do Sul" entries and merge them into one,
      // keeping the lowest id as canonical and moving jobs from the others over to it.
      const cruzeiroDupes = mergedClients.filter(c => c.name === "Cruzeiro do Sul");
      if (cruzeiroDupes.length > 1) {
        const canonical = cruzeiroDupes.reduce((a,b) => a.id < b.id ? a : b);
        const dupeIds = cruzeiroDupes.filter(c => c.id !== canonical.id).map(c => c.id);
        mergedJobs = mergedJobs.map(j => dupeIds.includes(j.clientId) ? {...j, clientId: canonical.id} : j);
        mergedClients = mergedClients.filter(c => !dupeIds.includes(c.id));
      } else {
        // No duplicate yet — fall back to the original rename-if-needed logic.
        const rio2cClient = mergedClients.find(c => c.id === 7 && c.name === "RIO2C");
        if (rio2cClient) {
          mergedClients = mergedClients.map(c => c.id === 7 ? {...c, name: "Cruzeiro do Sul"} : c);
        }
      }
      // Move job "GINGA" (id 106) from the old standalone "GINGA" client (id 6) into the
      // new "CWB Brasil" client (id 9), without losing any edits already saved on the job
      // (value, valorRecebido, status, dates, etc. are preserved — only clientId changes).
      const cwbClient = mergedClients.find(c => c.name === "CWB Brasil");
      if (cwbClient) {
        mergedJobs = mergedJobs.map(j => (j.id === 106 || (j.desc === "GINGA" && j.clientId === 6)) ? {...j, clientId: cwbClient.id} : j);
      }

      setClients(mergedClients);

      // ── Date model migration ──
      // Jobs: old `datePay` becomes `dateDueExpected` (previsão de recebimento).
      // Old binary statuses map to the new stage system.
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
        if (m.status === "pendente") m.status = "fechado";
        return m;
      });
      setJobs(mergedJobs);

      setReimbursements(data.reimbursements);

      const savedFLIds = new Set(data.freelancers.map(f => f.id));
      setFreelancers([...data.freelancers, ...DEFAULT_FREELANCERS.filter(f => !savedFLIds.has(f.id))]);

      const savedCacheIds = new Set(data.caches.map(c => c.id));
      let mergedCaches = [...data.caches, ...DEFAULT_CACHES.filter(c => !savedCacheIds.has(c.id))];
      // Caches: old `datePay` becomes `dateDue` (quando combinou de pagar).
      mergedCaches = mergedCaches.map(c => {
        const m = {...c};
        if (m.datePay !== undefined && m.dateDue === undefined) {
          m.dateDue = m.datePay || "";
          delete m.datePay;
        }
        if (m.datePaid === undefined) m.datePaid = "";
        return m;
      });
      setCaches(mergedCaches);

      const savedProjExpIds = new Set(data.projectExpenses.map(e => e.id));
      setProjectExpenses([...data.projectExpenses, ...DEFAULT_PROJ_EXPENSES.filter(e => !savedProjExpIds.has(e.id))]);

      setStudioExpenses(Array.isArray(data.studioExpenses) ? data.studioExpenses : []);
      setSubscriptions(Array.isArray(data.subscriptions) ? data.subscriptions : []);

      setLoaded(true);
    });
  }, []);

  const saveTimer = useRef(null);
  const [isSavingNow, setIsSavingNow] = useState(false);

  const runDiagnostic = async () => {
    setDiagRunning(true);
    setDiagResult(null);
    const testValue = `teste-${Date.now()}`;
    try {
      const testRef = doc(db, "produtora", currentUid, "_meta", "diagnostico");
      await withTimeout(setDoc(testRef, { marker: testValue, ts: new Date().toISOString() }), 8000, "escrever teste");
      const snap = await withTimeout(getDoc(testRef), 8000, "ler teste");
      if (snap.exists() && snap.data().marker === testValue) {
        setDiagResult({ ok: true, msg: `Escrita e leitura confirmadas às ${new Date().toLocaleTimeString("pt-BR")}. O Firebase está funcionando normalmente — se seus dados ainda não aparecem, o problema é o navegador estar com uma versão antiga do site em cache (tente aba anônima).` });
      } else {
        setDiagResult({ ok: false, msg: "Escreveu mas não conseguiu ler de volta o valor esperado. Pode ser regra de segurança do Firestore bloqueando leitura." });
      }
    } catch (e) {
      setDiagResult({ ok: false, msg: `Falhou: ${e.code || e.message || e}. Provavelmente é bloqueio de rede/extensão, ou as credenciais/projeto do Firebase estão incorretos.` });
    }
    setDiagRunning(false);
  };

  const saveNow = async () => {
    setIsSavingNow(true);
    const ok = await saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions });
    setIsSavingNow(false);
    if (ok) {
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    }
  };

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions });
      if (ok) {
        setSavedIndicator(true);
        setTimeout(() => setSavedIndicator(false), 2000);
      }
    }, 1200);
  }, [expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions, loaded]);

  // Force an immediate save if the person closes the tab, refreshes, or switches
  // away before the debounce timer above has fired — prevents losing the last
  // edit made right before navigating away.
  useEffect(() => {
    if (!loaded) return;
    const flush = () => {
      clearTimeout(saveTimer.current);
      saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, studioExpenses, subscriptions, loaded]);

  const emptyE = {desc:"",value:"",category:"Outros",jobId:"",natureza:"overhead",dateWork:today(),datePay:"",status:"a pagar"};
  const emptyStudio = {desc:"",value:"",category:STUDIO_CATEGORIES[0],dayOfMonth:"5",dateStart:today(),active:true};
  const emptySub = {desc:"",value:"",category:SUB_CATEGORIES[0],cycle:"mensal",dayOfMonth:"1",dateStart:today(),active:true};
  const emptyClient = {name:""};
  const emptyJob = {desc:"",value:"",valorRecebido:"0",nfRate:0.12,dateWork:today(),dateDelivery:"",dateInvoice:"",dateDueExpected:"",dateReceived:"",payments:[],status:"negociação",notes:"",contrato:""};
  const emptyReim = {pessoa:"",desc:"",value:"",tipo:"Adiantamento profissional",devolvidoPara:"Frames",datePay:"",status:"pendente"};
  const emptyFL = {name:"",apelido:"",role:ROLES[0],phone:"",email:"",cpf:"",rg:"",nasc:""};
  const emptyCache = {freelancerId:"",role:ROLES[0],desc:"",value:"",alimentacao:"",logistica:"",dateWork:today(),dateDue:"",datePaid:"",paymentMethod:"Pix/Transferência",status:"a pagar"};
  const emptyProjExp = {type:EXPENSE_TYPES[0],desc:"",value:"",source:PAYMENT_SOURCES[0],paymentType:"à vista",parcelas:"2",dateWork:today(),datePay:"",status:"a pagar"};

  const [formE, setFormE] = useState(emptyE);
  const [formClient, setFormClient] = useState(emptyClient);
  const [formJob, setFormJob] = useState(emptyJob);
  const [formReim, setFormReim] = useState(emptyReim);
  const [formFL, setFormFL] = useState(emptyFL);
  const [formCache, setFormCache] = useState(emptyCache);
  const [formProjExp, setFormProjExp] = useState(emptyProjExp);
  const [formStudio, setFormStudio] = useState(emptyStudio);
  const [formSub, setFormSub] = useState(emptySub);
  const [showAddStudio, setShowAddStudio] = useState(false);
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
    const studioFixedMonthly=studioExpenses.filter(e=>e.active!==false).reduce((s,e)=>s+Number(e.value),0);
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
      items.push({tipo:"Pagar cachê",desc:`${fl?.apelido||fl?.name||"?"} — ${job?.desc||"?"}`,value:cacheTotal(c),datePay:c.dateDue,color:"#a78bfa",icon:"👤"});
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

  // Financial health indicator
  const healthIndicator = useMemo(()=>{
    const {projected,totalReceivables}=totals;
    if(totalReceivables===0) return {label:"Sem dados",color:"#64748b",icon:"—"};
    const margin=projected/totalReceivables;
    if(margin>=0.3) return {label:"Saudável",color:"#22c55e",icon:"✅"};
    if(margin>=0.1) return {label:"Atenção",color:"#f59e0b",icon:"⚠️"};
    if(margin>=0) return {label:"Margem apertada",color:"#fb923c",icon:"🔶"};
    return {label:"Prejuízo projetado",color:"#ef4444",icon:"🔴"};
  },[totals]);

  const addExpense=()=>{if(!formE.desc||!formE.value)return;setExpenses(p=>[...p,{...formE,id:Date.now(),value:Number(formE.value)}]);logChange(`Gasto: ${formE.desc}`);setFormE(emptyE);};
  const addClient=()=>{if(!formClient.name)return;setClients(p=>[...p,{...formClient,id:Date.now()}]);logChange(`Cliente adicionado: ${formClient.name}`);setFormClient(emptyClient);setShowAddClient(false);};
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
    setJobs(p=>[...p,{...formJob,id:Date.now(),clientId:selectedClient,value:Number(formJob.value),valorRecebido:Number(formJob.valorRecebido||0),nfRate:Number(formJob.nfRate)}]);
    logChange(`Job adicionado: ${formJob.desc}`);
    setFormJob(emptyJob);setShowAddJob(false);
  };
  const removeJob=(id)=>{const j=jobs.find(x=>x.id===id);if(!confirmDelete(`Remover job "${j?.desc}"?`))return;setJobs(p=>p.filter(j=>j.id!==id));setCaches(p=>p.filter(c=>c.jobId!==id));setProjectExpenses(p=>p.filter(e=>e.jobId!==id));logChange(`Job removido: ${j?.desc}`);};
  const addReimb=()=>{if(!formReim.pessoa||!formReim.desc||!formReim.value)return;setReimbursements(p=>[...p,{...formReim,id:Date.now(),value:Number(formReim.value)}]);logChange(`Reembolso: ${formReim.pessoa}`);setFormReim(emptyReim);};
  const addCacheToJob=()=>{if(!formCache.freelancerId||!formCache.value)return;const fl=freelancers.find(f=>f.id===formCache.freelancerId);setCaches(p=>[...p,{...formCache,id:Date.now(),jobId:selectedJob,value:Number(formCache.value),alimentacao:Number(formCache.alimentacao||0),logistica:Number(formCache.logistica||0)}]);logChange(`Cache: ${fl?.apelido||fl?.name}`);setFormCache(emptyCache);setShowAddFL(false);};
  const addProjectExpense=()=>{if(!formProjExp.value)return;setProjectExpenses(p=>[...p,{...formProjExp,id:Date.now(),jobId:selectedJob,value:Number(formProjExp.value)}]);logChange(`Despesa: ${formProjExp.type}`);setFormProjExp(emptyProjExp);setShowAddExpense(false);};
  const removeCache=(id)=>{const c=caches.find(x=>x.id===id);const fl=freelancers.find(f=>f.id===c?.freelancerId);if(!confirmDelete(`Remover cachê de ${fl?.apelido||fl?.name}?`))return;setCaches(p=>p.filter(c=>c.id!==id));logChange(`Cache removido: ${fl?.apelido||fl?.name}`);};
  const removeFreelancer=(id)=>{const fl=freelancers.find(f=>f.id===id);if(!confirmDelete(`Remover profissional "${fl?.name}"?`))return;setFreelancers(p=>p.filter(f=>f.id!==id));setCaches(p=>p.filter(c=>c.freelancerId!==id));logChange(`Profissional removido: ${fl?.name}`);};
  const removeProjExp=(id)=>{const e=projectExpenses.find(x=>x.id===id);if(!confirmDelete(`Remover despesa "${e?.type}"?`))return;setProjectExpenses(p=>p.filter(e=>e.id!==id));logChange(`Despesa removida: ${e?.type}`);};
  const addStudioExpense=()=>{if(!formStudio.desc||!formStudio.value)return;setStudioExpenses(p=>[...p,{...formStudio,id:Date.now(),value:Number(formStudio.value)}]);logChange(`Despesa do estúdio: ${formStudio.desc}`);setFormStudio(emptyStudio);setShowAddStudio(false);};
  const removeStudioExpense=(id)=>{const e=studioExpenses.find(x=>x.id===id);if(!confirmDelete(`Remover "${e?.desc}"?`))return;setStudioExpenses(p=>p.filter(e=>e.id!==id));logChange(`Despesa do estúdio removida: ${e?.desc}`);};
  const addSubscription=()=>{if(!formSub.desc||!formSub.value)return;setSubscriptions(p=>[...p,{...formSub,id:Date.now(),value:Number(formSub.value)}]);logChange(`Assinatura: ${formSub.desc}`);setFormSub(emptySub);setShowAddSub(false);};
  const removeSubscription=(id)=>{const e=subscriptions.find(x=>x.id===id);if(!confirmDelete(`Remover assinatura "${e?.desc}"?`))return;setSubscriptions(p=>p.filter(e=>e.id!==id));logChange(`Assinatura removida: ${e?.desc}`);};

  const tabs=[{key:"profissionais",label:"👥 Profissionais"},{key:"dashboard",label:"📊 Balanço"},{key:"clients",label:"📥 Clientes"},{key:"expenses",label:"💸 Gastos"},{key:"studio",label:"🏢 Estúdio"},{key:"subscriptions",label:"🔁 Assinaturas"},{key:"reimbursements",label:"🔄 Reembolsos"}];

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
  const currentJobColor = currentJob ? getColor(currentJob.id) : "#a78bfa";
  const currentJobCaches = selectedJob ? jobCaches(selectedJob) : [];
  const currentJobExpList = selectedJob ? jobExpenses(selectedJob) : [];
  const currentJobTotal = selectedJob ? jobCostTotal(selectedJob) : 0;
  const expBySource = useMemo(()=>{const g={};currentJobExpList.forEach(e=>{if(!g[e.source])g[e.source]=[];g[e.source].push(e);});return g;},[currentJobExpList]);

  if (!loaded) return (
    <div style={{background:"#0f0f13",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#a78bfa",fontSize:16,fontFamily:"Inter,sans-serif"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>🎥</div><div>Carregando dados salvos...</div></div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#0f0f13",minHeight:"100vh",color:"#e2e8f0",paddingBottom:80}}>
      <style>{`
        @media (max-width: 480px) {
          .grid-2 { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
          .font-large { font-size: 14px !important; }
        }
        input, select, button { -webkit-tap-highlight-color: transparent; }
        * { box-sizing: border-box; }
      `}</style>
      {editingId&&editingId.startsWith("client:")&&<EditModal editData={editData} setEditData={setEditData} color="#34d399" onSave={()=>{setClients(p=>p.map(i=>i.id===editData.id?{...editData}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"name",label:"Nome do cliente"}]}/>}
      {editingId&&editingId.startsWith("job:")&&<EditModal editData={editData} setEditData={setEditData} color="#34d399" onSave={()=>{setJobs(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value),valorRecebido:Number(editData.valorRecebido||0),nfRate:Number(editData.nfRate)}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"desc",label:"Nome do projeto/job"},{key:"value",label:"Valor total (R$)",type:"number"},{key:"valorRecebido",label:"Já recebido (R$)",type:"number"},{key:"nfRate",label:"Nota Fiscal",type:"select",options:[{value:0,label:"Sem NF"},{value:0.06,label:"6%"},{value:0.12,label:"12%"}]},{key:"contrato",label:"Nº contrato / link proposta"},{key:"notes",label:"Observações"},{key:"dateWork",label:"📅 Realização (gravação)",type:"date"},{key:"dateDelivery",label:"📦 Entrega do material",type:"date"},{key:"dateInvoice",label:"🧾 Faturamento (NF emitida)",type:"date"},{key:"dateDueExpected",label:"💰 Previsão de recebimento",type:"date"},{key:"dateReceived",label:"✅ Recebido em (data real)",type:"date"},{key:"status",label:"Status",type:"select",options:JOB_STATUS}]}/>}
      {editingId&&editingId.startsWith("reimb:")&&<EditModal editData={editData} setEditData={setEditData} color="#fb923c" onSave={()=>saveEdit("reimb",setReimbursements)} onCancel={cancelEdit} fields={[{key:"pessoa",label:"Pessoa"},{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"devolvidoPara",label:"Devolvido para",type:"select",options:REIMB_SOURCES},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["pendente","recebido"]}]}/>}
      {editingId&&editingId.startsWith("cache:")&&<EditModal editData={editData} setEditData={setEditData} color="#a78bfa" onSave={()=>{setCaches(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value),alimentacao:Number(editData.alimentacao||0),logistica:Number(editData.logistica||0)}:i));cancelEdit();}} onCancel={cancelEdit} fields={[{key:"role",label:"Função",type:"select",options:ROLES},{key:"desc",label:"Descrição"},{key:"value",label:"Cachê (R$)",type:"number"},{key:"alimentacao",label:"Alimentação (R$)",type:"number"},{key:"logistica",label:"Logística (R$)",type:"number"},{key:"paymentMethod",label:"Forma de pagamento",type:"select",options:PAYMENT_METHODS},{key:"dateWork",label:"📅 Data do trabalho",type:"date"},{key:"dateDue",label:"⏰ Combinado pagar em",type:"date"},{key:"datePaid",label:"✅ Pago em (data real)",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("projexp:")&&<EditModal editData={editData} setEditData={setEditData} color="#f87171" onSave={()=>saveEdit("projexp",setProjectExpenses)} onCancel={cancelEdit} fields={[{key:"type",label:"Tipo",type:"select",options:EXPENSE_TYPES},{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"source",label:"Origem",type:"select",options:PAYMENT_SOURCES},{key:"paymentType",label:"Pagamento",type:"select",options:["à vista","parcelado"]},{key:"parcelas",label:"Parcelas",type:"select",options:["2","3","4","5","6","7","8","9","10","11","12"]},{key:"dateWork",label:"Data do trabalho",type:"date"},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("exp:")&&<EditModal editData={editData} setEditData={setEditData} color="#f87171" onSave={()=>saveEdit("exp",setExpenses)} onCancel={cancelEdit} fields={[{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"category",label:"Categoria",type:"select",options:CATEGORIES_EXPENSE},{key:"dateWork",label:"Data do gasto",type:"date"},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("studio:")&&<EditModal editData={editData} setEditData={setEditData} color="#22d3ee" onSave={()=>saveEdit("studio",setStudioExpenses)} onCancel={cancelEdit} fields={[{key:"desc",label:"Descrição"},{key:"value",label:"Valor mensal (R$)",type:"number"},{key:"category",label:"Categoria",type:"select",options:STUDIO_CATEGORIES},{key:"dayOfMonth",label:"Dia do vencimento",type:"number"},{key:"dateStart",label:"Ativo desde",type:"date"}]}/>}
      {editingId&&editingId.startsWith("sub:")&&<EditModal editData={editData} setEditData={setEditData} color="#facc15" onSave={()=>saveEdit("sub",setSubscriptions)} onCancel={cancelEdit} fields={[{key:"desc",label:"Nome"},{key:"value",label:"Valor (R$)",type:"number"},{key:"category",label:"Categoria",type:"select",options:SUB_CATEGORIES},{key:"cycle",label:"Cobrança",type:"select",options:BILLING_CYCLES},{key:"dayOfMonth",label:"Dia da cobrança",type:"number"},{key:"dateStart",label:"Ativo desde",type:"date"}]}/>}
      {editingId&&editingId.startsWith("fl:")&&<EditModal editData={editData} setEditData={setEditData} color="#a78bfa" onSave={()=>{setFreelancers(p=>p.map(i=>i.id===editData.id?{...editData}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"name",label:"Nome completo"},{key:"apelido",label:"Apelido"},{key:"role",label:"Função",type:"select",options:ROLES},{key:"phone",label:"WhatsApp"},{key:"email",label:"E-mail"},{key:"cpf",label:"CPF"},{key:"rg",label:"RG"},{key:"nasc",label:"Nascimento"}]}/>}

      {/* Error banner — shows real Firebase errors directly on screen, no devtools needed */}
      {saveError && (
        <div style={{background:"#7f1d1d",borderBottom:"2px solid #ef4444",padding:"10px 20px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:200}}>
          <span style={{fontSize:16}}>🔴</span>
          <div style={{flex:1,fontSize:12,color:"#fecaca"}}><strong>Problema ao salvar/carregar:</strong> {saveError}</div>
          <button onClick={()=>setSaveError(null)} style={{background:"transparent",border:"1px solid #fecaca66",color:"#fecaca",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>Fechar</button>
        </div>
      )}
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)",borderBottom:"1px solid #ffffff12",padding:"24px 24px 0"}}>
        <div style={{maxWidth:820,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#fff"}}>🎥 FramesBR <span style={{color:"#a78bfa"}}>Financial System</span></h1>
              <span style={{fontSize:11,background:healthIndicator.color+"22",color:healthIndicator.color,border:`1px solid ${healthIndicator.color}44`,borderRadius:6,padding:"2px 8px",fontWeight:600}}>{healthIndicator.icon} {healthIndicator.label}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:11,color:savedIndicator?"#22c55e":"#334155",transition:"color .3s"}}>{savedIndicator?"✅ Salvo":"💾 Auto-save ativo"}</span>
              <button onClick={runDiagnostic} disabled={diagRunning} style={{background:"#a78bfa22",border:"1px solid #a78bfa44",color:"#a78bfa",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:diagRunning?"default":"pointer",opacity:diagRunning?0.6:1}}>
                {diagRunning?"Testando...":"🔍 Testar Firebase"}
              </button>
              <button onClick={saveNow} disabled={isSavingNow} style={{background:"#34d39922",border:"1px solid #34d39944",color:"#34d399",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:isSavingNow?"default":"pointer",opacity:isSavingNow?0.6:1}}>
                {isSavingNow?"Salvando...":"💾 Salvar agora"}
              </button>
              <div style={{width:1,height:16,background:"#ffffff20"}}/>
              <span style={{fontSize:11,color:"#64748b"}}>{userEmail}</span>
              <button onClick={onLogout} style={{background:"#ef444422",border:"1px solid #ef444444",color:"#f87171",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                🚪 Sair
              </button>
            </div>
          </div>
          {diagResult && (
            <div style={{background:diagResult.ok?"#22c55e15":"#ef444415",border:`1px solid ${diagResult.ok?"#22c55e":"#ef4444"}44`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>{diagResult.ok?"✅":"❌"}</span>
              <span style={{fontSize:12,color:diagResult.ok?"#86efac":"#fecaca",flex:1}}>{diagResult.msg}</span>
              <button onClick={()=>setDiagResult(null)} style={{background:"transparent",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13}}>✕</button>
            </div>
          )}
          {/* Search bar */}
          <div style={{position:"relative",marginBottom:12}}>
            <input
              placeholder="🔍 Buscar clientes, jobs, profissionais..."
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
              style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff20",borderRadius:10,padding:"8px 14px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}
            />
            {searchResults&&searchResults.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1e1e2e",border:"1px solid #ffffff20",borderRadius:10,zIndex:50,marginTop:4,overflow:"hidden"}}>
                {searchResults.map((r,i)=>(
                  <div key={i} onClick={()=>{r.action();setSearchQuery("");}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #ffffff08",display:"flex",alignItems:"center",gap:10}}
                    onMouseEnter={e=>e.currentTarget.style.background="#ffffff08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontSize:10,background:"#a78bfa22",color:"#a78bfa",borderRadius:4,padding:"2px 6px",flexShrink:0}}>{r.type}</span>
                    <span style={{fontSize:13,color:"#e2e8f0"}}>{r.label}</span>
                    {r.sub&&<span style={{fontSize:11,color:"#64748b"}}>{r.sub}</span>}
                  </div>
                ))}
              </div>
            )}
            {searchResults&&searchResults.length===0&&searchQuery&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1e1e2e",border:"1px solid #ffffff20",borderRadius:10,zIndex:50,marginTop:4,padding:"12px 14px",fontSize:13,color:"#64748b"}}>Nenhum resultado para "{searchQuery}"</div>
            )}
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {tabs.map(t=>(<button key={t.key} onClick={()=>{setTab(t.key);setSelectedClient(null);setSelectedJob(null);setShowAddFL(false);setShowAddExpense(false);setShowAddClient(false);setShowAddJob(false);setSearchQuery("");}} style={{padding:"8px 14px",border:"none",cursor:"pointer",fontSize:12,fontWeight:500,background:tab===t.key?"#a78bfa":"transparent",color:tab===t.key?"#fff":"#94a3b8",borderRadius:"8px 8px 0 0",transition:"all .15s"}}>{t.label}</button>))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",padding:"24px 24px 0"}}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
              {[{key:"geral",label:"📊 Geral"},{key:"apagar",label:"💳 A Pagar"},{key:"vencimentos",label:"📅 Vencimentos"},{key:"mensal",label:"📈 Por Mês"}].map(st=>(<button key={st.key} onClick={()=>setDashSubTab(st.key)} style={{padding:"8px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,borderRadius:8,background:dashSubTab===st.key?"#a78bfa":"#1e1e2e",color:dashSubTab===st.key?"#fff":"#64748b"}}>{st.label}{st.key==="apagar"&&weeklyAPagar.length>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,marginLeft:6}}>{weeklyAPagar.length}</span>}</button>))}
            </div>
            {dashSubTab==="geral"&&(<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                {[{label:"Saldo Atual",value:totals.balance,color:totals.balance>=0?"#22c55e":"#ef4444",sub:"recebido − gastos − cachês pagos − reembolsos pagos"},{label:"Projetado Líquido",value:totals.projected,color:"#a78bfa",sub:`após NF (${formatBRL(totals.totalNF)}) − todos os custos`},{label:"Clientes (total bruto)",value:totals.totalReceivables,color:"#34d399",sub:`${formatBRL(totals.received)} já recebido`},{label:"Gastos nos projetos",value:totals.totalProjExp+totals.totalCaches,color:"#f87171",sub:`${formatBRL(totals.cachesAPagar)} cachês a pagar`},{label:"Custo fixo mensal",value:totals.totalFixedMonthly,color:"#22d3ee",sub:`${formatBRL(totals.studioFixedMonthly)} estúdio · ${formatBRL(totals.subsFixedMonthly)} assinaturas`}].map(c=>(
                  <div key={c.label} style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"18px 20px"}}>
                    <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{c.label}</div>
                    <div style={{fontSize:22,fontWeight:700,color:c.color}}>{formatBRL(c.value)}</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:4}}>{c.sub}</div>
                  </div>
                ))}
              </div>
              {/* Meta de faturamento */}
              <div style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"16px 20px",marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showMeta&&meta.value?12:showMeta?12:0}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#cbd5e1"}}>🎯 Meta de faturamento</span>
                  <button onClick={()=>setShowMeta(v=>!v)} style={{background:"transparent",border:"none",color:"#64748b",fontSize:12,cursor:"pointer"}}>{showMeta?"▲ Fechar":"✏️ Definir meta"}</button>
                </div>
                {showMeta&&(<div style={{display:"flex",gap:8,marginBottom:meta.value?12:0}}>
                  <div style={{flex:1}}><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Valor da meta (R$)</div><input type="number" value={meta.value} onChange={e=>setMeta(p=>({...p,value:e.target.value}))} placeholder="Ex: 50000" style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Período</div><select value={meta.period} onChange={e=>setMeta(p=>({...p,period:e.target.value}))} style={{background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}><option value="mensal">Mensal</option><option value="anual">Anual</option></select></div>
                </div>)}
                {Number(meta.value)>0&&(()=>{const pct=Math.min((totals.totalReceivables/Number(meta.value))*100,100);return(<div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#64748b",marginBottom:6}}><span>{formatBRL(totals.totalReceivables)} de {formatBRL(meta.value)} ({meta.period})</span><span style={{color:pct>=100?"#22c55e":pct>=50?"#f59e0b":"#f87171",fontWeight:700}}>{pct.toFixed(0)}%</span></div>
                  <div style={{background:"#ffffff0f",borderRadius:6,height:10,overflow:"hidden"}}><div style={{background:pct>=100?"#22c55e":pct>=50?"#f59e0b":"#f87171",height:"100%",width:`${pct}%`,borderRadius:6,transition:"width .5s"}}/></div>
                </div>);})()}
              </div>
              <div style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"20px",marginBottom:16}}>
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
                    return(<div key={cl.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"10px 12px",background:"#0f0f1388",borderRadius:10,border:`1px solid ${cor}22`}}>
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
              <div style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"20px"}}>
                <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#cbd5e1"}}>👥 Profissionais por cachê recebido</h3>
                {(()=>{
                  const ranked = freelancers
                    .map(fl=>{
                      const fc=caches.filter(c=>c.freelancerId===fl.id);
                      const total=fc.reduce((s,c)=>s+cacheTotal(c),0);
                      const pagos=fc.filter(c=>c.status==="pago").reduce((s,c)=>s+cacheTotal(c),0);
                      const aPagar=total-pagos;
                      return {fl, total, pagos, aPagar, jobs:fc.length};
                    })
                    .filter(({total})=>total>0)
                    .sort((a,b)=>b.total-a.total);
                  if(ranked.length===0) return <div style={{fontSize:12,color:"#475569"}}>Nenhum cachê lançado ainda.</div>;
                  return ranked.map(({fl,total,pagos,aPagar,jobs},i)=>{
                    const flIdx=freelancers.findIndex(f=>f.id===fl.id);
                    const cor=getColor(flIdx);
                    const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`;
                    return(<div key={fl.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"10px 12px",background:"#0f0f1388",borderRadius:10,border:`1px solid ${cor}22`}}>
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
              {changeLog.length>0&&<div style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"20px",marginTop:16}}>
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
                        return(<div key={c.id} style={{background:"#1e1e2e",border:`1px solid ${cor}22`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
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
                    return(<div key={i} style={{background:"#1e1e2e",border:`1px solid ${item.color}33`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
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
                  <div style={{display:"flex",gap:4,background:"#0f0f13",borderRadius:8,padding:4}}>
                    {[{key:"caixa",label:"💵 Caixa"},{key:"competencia",label:"📋 Competência"}].map(m=>(
                      <button key={m.key} onClick={()=>setMonthMode(m.key)} style={{padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:monthMode===m.key?"#a78bfa":"transparent",color:monthMode===m.key?"#fff":"#475569"}}>{m.label}</button>
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
                    return(<div key={m.key} style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"18px 20px",marginBottom:12}}>
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
                        {m.caches>0&&<div style={{background:"#a78bfa10",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>👥 Cachês</div><div style={{fontSize:13,fontWeight:600,color:"#a78bfa"}}>{formatBRL(m.caches)}</div></div>}
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
            <button onClick={()=>setShowAddClient(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddClient?"#1e1e2e":"#34d39922",border:"1px solid #34d39944",borderRadius:12,color:"#34d399",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddClient?"▲ Fechar":"＋ Adicionar cliente"}</button>
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
                  style={{background:"#1e1e2e",border:isDragOver?`2px dashed ${cor}`:`2px solid ${cor}33`,borderRadius:14,padding:"16px 18px",cursor:"grab",display:"flex",alignItems:"center",gap:14,opacity:isDragging?0.4:1,transition:"opacity .15s, border-color .15s"}}>
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
              <div style={{background:"#1e1e2e",border:`2px solid ${cor}33`,borderRadius:16,padding:"20px",marginBottom:20}}>
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

            <button onClick={()=>setShowAddJob(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddJob?"#1e1e2e":"#a78bfa22",border:"1px solid #a78bfa44",borderRadius:12,color:"#a78bfa",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddJob?"▲ Fechar":"＋ Adicionar projeto/job para este cliente"}</button>
            {showAddJob&&(
              <FormCard title="Novo Projeto/Job" color="#a78bfa">
                <Input label="Nome do projeto/job" value={formJob.desc} onChange={v=>setFormJob(p=>({...p,desc:v}))}/>
                <Row><Input label="Valor total (R$)" type="number" value={formJob.value} onChange={v=>setFormJob(p=>({...p,value:v}))}/><Input label="Já recebido (R$)" type="number" value={formJob.valorRecebido} onChange={v=>setFormJob(p=>({...p,valorRecebido:v}))}/></Row>
                <Row><Input label="📅 Realização (gravação)" type="date" value={formJob.dateWork} onChange={v=>setFormJob(p=>({...p,dateWork:v}))}/><Input label="📦 Entrega do material" type="date" value={formJob.dateDelivery} onChange={v=>setFormJob(p=>({...p,dateDelivery:v}))}/></Row>
                <Row><Input label="🧾 Faturamento (NF)" type="date" value={formJob.dateInvoice} onChange={v=>setFormJob(p=>({...p,dateInvoice:v}))}/><Input label="💰 Previsão de recebimento" type="date" value={formJob.dateDueExpected} onChange={v=>setFormJob(p=>({...p,dateDueExpected:v}))}/></Row>
                <Row>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Nota Fiscal</div>
                    <div style={{display:"flex",gap:4,background:"#0f0f13",borderRadius:8,padding:4}}>
                      {[{label:"Sem NF",value:0},{label:"6%",value:0.06},{label:"12%",value:0.12}].map(opt=>(<button key={opt.label} onClick={()=>setFormJob(p=>({...p,nfRate:opt.value}))} style={{flex:1,padding:"6px 8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:formJob.nfRate===opt.value?"#f87171":"transparent",color:formJob.nfRate===opt.value?"#fff":"#475569"}}>{opt.label}</button>))}
                    </div>
                  </div>
                  <Select label="Status" value={formJob.status} onChange={v=>setFormJob(p=>({...p,status:v}))} options={JOB_STATUS}/>
                </Row>
                <Input label="Nº contrato / link da proposta (opcional)" value={formJob.contrato} onChange={v=>setFormJob(p=>({...p,contrato:v}))}/>
                <Input label="Observações (opcional)" value={formJob.notes} onChange={v=>setFormJob(p=>({...p,notes:v}))}/>
                <AddBtn onClick={addJob} color="#a78bfa">+ Adicionar Job</AddBtn>
              </FormCard>
            )}

            {clientJobs(selectedClient).length===0&&!showAddJob&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhum projeto/job lançado ainda para este cliente.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {clientJobs(selectedClient).map(job=>{
                const cost=jobCostTotal(job.id);
                const nf=Number(job.value)*Number(job.nfRate||0);
                const margem=Number(job.value)-nf-cost;
                const saldoDevedor=Number(job.value)-Number(job.valorRecebido||0);
                return(<div key={job.id} onClick={()=>setSelectedJob(job.id)} style={{background:"#1e1e2e",border:"1px solid #ffffff0a",borderRadius:12,padding:"14px 16px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{job.desc}{(()=>{
                        if(job.status==="recebido"||!job.dateDueExpected) return null;
                        const overdue=Math.ceil((new Date(today())-new Date(job.dateDueExpected))/(1000*60*60*24));
                        if(overdue>0) return <span style={{fontSize:10,background:"#ef444422",color:"#ef4444",border:"1px solid #ef444444",borderRadius:5,padding:"2px 6px",marginLeft:8,fontWeight:700}}>🔴 Atrasado {overdue}d</span>;
                        return null;
                      })()}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{job.dateWork&&<span>📅 {job.dateWork}</span>}{job.dateDelivery&&<span> · 📦 {job.dateDelivery}</span>}{job.dateDueExpected&&<span> · 💰 prev. {job.dateDueExpected}</span>}{job.dateReceived&&<span style={{color:"#22c55e"}}> · ✅ {job.dateReceived}</span>}{job.nfRate>0&&<span> · NF {job.nfRate*100}%</span>}</div>
                      {job.contrato&&<div style={{fontSize:10,color:"#475569",marginTop:2}}>📋 {job.contrato}</div>}
                      {job.notes&&<div style={{fontSize:10,color:"#475569",marginTop:1}}>💬 {job.notes}</div>}
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(job.value)}</div>
                    <button onClick={(e)=>{e.stopPropagation();toggleStatus(jobs,setJobs,job.id,JOB_STATUS);}} style={{background:statusColor[job.status]+"22",color:statusColor[job.status],border:`1px solid ${statusColor[job.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{job.status}</button>
                    <button onClick={(e)=>{e.stopPropagation();startEdit("job",job);}} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
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

            <div style={{background:"#1e1e2e",border:`2px solid ${currentJobColor}33`,borderRadius:16,padding:"20px",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:12,height:12,borderRadius:"50%",background:currentJobColor}}/><h2 style={{margin:0,fontSize:18,fontWeight:700,color:"#fff"}}>{currentJob.desc}</h2></div>
                <div style={{display:"flex",gap:4,background:"#0f0f13",borderRadius:8,padding:4}}>
                  {[{label:"Sem NF",value:0},{label:"6%",value:0.06},{label:"12%",value:0.12}].map(opt=>{const active=Number(currentJob.nfRate)===opt.value;return(<button key={opt.label} onClick={()=>setJobs(p=>p.map(j=>j.id===selectedJob?{...j,nfRate:opt.value}:j))} style={{padding:"5px 11px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:active?"#f87171":"transparent",color:active?"#fff":"#475569"}}>{opt.label}</button>);})}
                </div>
              </div>
              {(()=>{const clientVal=Number(currentJob.value)||0;const rate=Number(currentJob.nfRate)||0;const nf=clientVal*rate;const liquido=clientVal-nf;const margem=liquido-currentJobTotal;const payments=Array.isArray(currentJob.payments)?currentJob.payments:[];const paidFromList=payments.reduce((s,p)=>s+Number(p.value),0);const jaRecebido=paidFromList>0?paidFromList:Number(currentJob.valorRecebido||0);const saldoDevedor=clientVal-jaRecebido;return(<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:"#34d39910",border:"1px solid #34d39930",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Valor do job</div><div style={{fontSize:16,fontWeight:700,color:"#34d399"}}>{formatBRL(clientVal)}</div><div style={{fontSize:10,color:statusColor[currentJob.status]}}>{currentJob.status}</div></div>
                  <div style={{background:rate>0?"#f8717115":"#ffffff08",border:`1px solid ${rate>0?"#f8717130":"#ffffff10"}`,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Nota Fiscal{rate>0?` (${rate*100}%)`:""}</div><div style={{fontSize:16,fontWeight:700,color:rate>0?"#f87171":"#334155"}}>{rate>0?`− ${formatBRL(nf)}`:"Sem desconto"}</div></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:"#22c55e12",border:"1px solid #22c55e33",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>✅ Já recebido</div><div style={{fontSize:16,fontWeight:700,color:"#22c55e"}}>{formatBRL(jaRecebido)}</div></div>
                  <div style={{background:saldoDevedor>0?"#f59e0b12":"#22c55e12",border:`1px solid ${saldoDevedor>0?"#f59e0b33":"#22c55e33"}`,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>⏳ Saldo devedor</div><div style={{fontSize:16,fontWeight:700,color:saldoDevedor>0?"#f59e0b":"#22c55e"}}>{formatBRL(saldoDevedor)}</div></div>
                </div>
                {/* Histórico de pagamentos parciais */}
                <div style={{background:"#0f0f1366",border:"1px solid #ffffff0a",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
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
              {[{key:"equipe",label:"👥 Equipe & Cachês"},{key:"gastos",label:"💸 Despesas do Job"}].map(st=>(<button key={st.key} onClick={()=>{setJobSubTab(st.key);setShowAddFL(false);setShowAddExpense(false);}} style={{flex:1,padding:"10px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,borderRadius:10,background:jobSubTab===st.key?currentJobColor:"#1e1e2e",color:jobSubTab===st.key?"#fff":"#64748b"}}>{st.label}</button>))}
            </div>

            {jobSubTab==="equipe"&&(
              <div>
                <button onClick={()=>setShowAddFL(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddFL?"#1e1e2e":currentJobColor+"22",border:`1px solid ${currentJobColor}44`,borderRadius:12,color:currentJobColor,fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddFL?"▲ Fechar":"＋ Adicionar profissional"}</button>
                {showAddFL&&(
                  <div style={{background:"#1e1e2e",border:`1px solid ${currentJobColor}33`,borderRadius:14,padding:20,marginBottom:16}}>
                    {freelancers.length>0?(<>
                      <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:currentJobColor}}>Adicionar cachê</h3>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Profissional</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{freelancers.map((fl,idx)=>{const cor=getColor(idx);const sel=formCache.freelancerId===fl.id;return(<button key={fl.id} onClick={()=>setFormCache(p=>({...p,freelancerId:fl.id,role:fl.role}))} style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",background:sel?cor:cor+"22",color:sel?"#fff":cor,border:`1px solid ${cor}`}}>{fl.apelido||fl.name.split(" ")[0]}</button>);})}</div>
                        </div>
                        <Row><Select label="Função" value={formCache.role} onChange={v=>setFormCache(p=>({...p,role:v}))} options={ROLES}/><Input label="💰 Cachê (R$)" type="number" value={formCache.value} onChange={v=>setFormCache(p=>({...p,value:v}))}/></Row>
                        <Input label="Descrição (opcional)" value={formCache.desc} onChange={v=>setFormCache(p=>({...p,desc:v}))}/>
                        <Row><Input label="🍽️ Alimentação (R$)" type="number" value={formCache.alimentacao} onChange={v=>setFormCache(p=>({...p,alimentacao:v}))}/><Input label="🚗 Logística (R$)" type="number" value={formCache.logistica} onChange={v=>setFormCache(p=>({...p,logistica:v}))}/></Row>
                        <Row><Input label="📅 Data do trabalho" type="date" value={formCache.dateWork} onChange={v=>setFormCache(p=>({...p,dateWork:v}))}/><Input label="⏰ Combinado pagar em" type="date" value={formCache.dateDue} onChange={v=>setFormCache(p=>({...p,dateDue:v}))}/></Row>
                        <Input label="✅ Pago em (data real)" type="date" value={formCache.datePaid} onChange={v=>setFormCache(p=>({...p,datePaid:v}))}/>
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
                          <AddBtn onClick={()=>{if(!formFL.name)return;const id=Date.now();setFreelancers(prev=>[...prev,{...formFL,id}]);if(formCache.value)setCaches(prev=>[...prev,{...formCache,id:Date.now()+1,freelancerId:id,jobId:selectedJob,value:Number(formCache.value),alimentacao:Number(formCache.alimentacao||0),logistica:Number(formCache.logistica||0)}]);setFormFL(emptyFL);setFormCache(emptyCache);setShowNewFLForm(false);setShowAddFL(false);}} color={currentJobColor}>+ Cadastrar e adicionar</AddBtn>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {currentJobCaches.length===0&&!showAddFL&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>Nenhum profissional adicionado. <span style={{color:currentJobColor,cursor:"pointer"}} onClick={()=>setShowAddFL(true)}>+ Adicionar</span></div>}
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {currentJobCaches.map(c=>{
                    const fl=freelancers.find(f=>f.id===c.freelancerId);const flIdx=freelancers.findIndex(f=>f.id===c.freelancerId);const cor=getColor(flIdx);const total=cacheTotal(c);
                    return(<div key={c.id} style={{background:"#1e1e2e",border:`1px solid ${cor}22`,borderRadius:14,padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                        <div style={{width:38,height:38,borderRadius:"50%",background:cor+"22",border:`2px solid ${cor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:cor,flexShrink:0}}>{fl?(fl.apelido?fl.apelido.slice(0,3):fl.name[0]):"?"}</div>
                        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{fl?.name||"\u2014"}{c.desc&&<span style={{color:"#64748b",fontWeight:400}}> \u2014 {c.desc}</span>}{(()=>{if(c.status==="pago")return null;const ref=c.dateDue||c.dateWork;if(!ref)return null;const age=Math.ceil((new Date(today())-new Date(ref))/(1000*60*60*24));if(age>30)return <span style={{fontSize:10,background:"#ef444422",color:"#ef4444",borderRadius:5,padding:"2px 6px",marginLeft:6,fontWeight:700}}>h\u00e1 {age}d sem pagar</span>;return null;})()}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{c.role}{c.dateWork&&` \u00b7 \ud83d\udcc5 ${c.dateWork}`}{c.dateDue&&` \u00b7 \u23f0 ${c.dateDue}`}{c.datePaid&&<span style={{color:"#22c55e"}}> \u00b7 \u2705 {c.datePaid}</span>}{c.paymentMethod&&c.status==="pago"&&<span style={{color:"#22c55e"}}> \u00b7 {c.paymentMethod}</span>}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{formatBRL(total)}</div></div>
                        <button onClick={()=>toggleStatus(caches,setCaches,c.id,["a pagar","pago"])} style={{background:statusColor[c.status]+"22",color:statusColor[c.status],border:`1px solid ${statusColor[c.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{c.status}</button>
                        <button onClick={()=>startEdit("cache",c)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                        <button onClick={()=>removeCache(c.id)} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                      </div>
                      <div style={{display:"flex",gap:8,paddingLeft:50}}>
                        <div style={{background:"#a78bfa15",border:"1px solid #a78bfa33",borderRadius:8,padding:"5px 10px",flex:1}}><div style={{fontSize:10,color:"#a78bfa",marginBottom:2}}>💰 Cachê</div><div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{formatBRL(c.value)}</div></div>
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
                <button onClick={()=>setShowAddExpense(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddExpense?"#1e1e2e":"#f8717122",border:"1px solid #f8717144",borderRadius:12,color:"#f87171",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddExpense?"▲ Fechar":"＋ Adicionar despesa"}</button>
                {showAddExpense&&(
                  <div style={{background:"#1e1e2e",border:"1px solid #f8717133",borderRadius:14,padding:20,marginBottom:16}}>
                    <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#f87171"}}>Nova Despesa</h3>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Tipo de gasto</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{EXPENSE_TYPES.map(t=>(<button key={t} onClick={()=>setFormProjExp(p=>({...p,type:t}))} style={{padding:"5px 11px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:formProjExp.type===t?"#f87171":"#f8717120",color:formProjExp.type===t?"#fff":"#f87171"}}>{TYPE_ICON[t]} {t}</button>))}</div>
                      </div>
                      <Input label="Descrição (opcional)" value={formProjExp.desc} onChange={v=>setFormProjExp(p=>({...p,desc:v}))}/>
                      <Row><Input label="Valor (R$)" type="number" value={formProjExp.value} onChange={v=>setFormProjExp(p=>({...p,value:v}))}/><Input label="📅 Data do trabalho" type="date" value={formProjExp.dateWork} onChange={v=>setFormProjExp(p=>({...p,dateWork:v}))}/></Row>
                      <Input label="💰 Data de pagamento" type="date" value={formProjExp.datePay} onChange={v=>setFormProjExp(p=>({...p,datePay:v}))}/>
                      <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>De onde saiu o dinheiro</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{PAYMENT_SOURCES.map(s=>{const cor=SOURCE_COLOR[s]||"#94a3b8";const sel=formProjExp.source===s;return(<button key={s} onClick={()=>setFormProjExp(p=>({...p,source:s}))} style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",background:sel?cor:cor+"22",color:sel?"#000":cor,border:`1px solid ${cor}66`}}>{s}</button>);})}</div>
                      </div>
                      <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Forma de pagamento</div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          {["à vista","parcelado"].map(pt=>(<button key={pt} onClick={()=>setFormProjExp(p=>({...p,paymentType:pt}))} style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:formProjExp.paymentType===pt?"#a78bfa":"#a78bfa22",color:formProjExp.paymentType===pt?"#fff":"#a78bfa"}}>{pt==="à vista"?"💵 À vista":"📆 Parcelado"}</button>))}
                          {formProjExp.paymentType==="parcelado"&&<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:"#64748b"}}>Parcelas:</span><select value={formProjExp.parcelas} onChange={e=>setFormProjExp(p=>({...p,parcelas:e.target.value}))} style={{background:"#0f0f13",border:"1px solid #ffffff20",borderRadius:6,padding:"4px 8px",color:"#e2e8f0",fontSize:12}}>{["2","3","4","5","6","7","8","9","10","11","12"].map(n=><option key={n}>{n}x</option>)}</select></div>}
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
                      {items.map(item=>(<div key={item.id} style={{background:"#1e1e2e",border:`1px solid ${cor}22`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:18}}>{TYPE_ICON[item.type]||"📦"}</span>
                        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.type}{item.desc?` — ${item.desc}`:""}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.dateWork&&<span>📅 {item.dateWork}</span>}{item.datePay&&<span> · 💰 {item.datePay}</span>}{item.paymentType==="parcelado"&&<span style={{color:"#a78bfa",marginLeft:6}}>📆 {item.parcelas}x</span>}</div></div>
                        <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}</div>
                        <button onClick={()=>toggleStatus(projectExpenses,setProjectExpenses,item.id,["a pagar","pago"])} style={{background:statusColor[item.status]+"22",color:statusColor[item.status],border:`1px solid ${statusColor[item.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.status}</button>
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

        {/* ── PROFISSIONAIS ── */}
        {tab==="profissionais"&&(
          <div>
            <FormCard title="Cadastrar novo profissional" color="#a78bfa">
              <Row><Input label="Nome completo" value={formFL.name} onChange={v=>setFormFL(p=>({...p,name:v}))}/><Input label="Apelido" value={formFL.apelido} onChange={v=>setFormFL(p=>({...p,apelido:v}))}/></Row>
              <Row><Input label="WhatsApp" value={formFL.phone} onChange={v=>setFormFL(p=>({...p,phone:v}))}/><Input label="E-mail" value={formFL.email} onChange={v=>setFormFL(p=>({...p,email:v}))}/></Row>
              <Row><Select label="Função" value={formFL.role} onChange={v=>setFormFL(p=>({...p,role:v}))} options={ROLES}/><Input label="Nascimento" value={formFL.nasc} onChange={v=>setFormFL(p=>({...p,nasc:v}))}/></Row>
              <Row><Input label="CPF" value={formFL.cpf} onChange={v=>setFormFL(p=>({...p,cpf:v}))}/><Input label="RG" value={formFL.rg} onChange={v=>setFormFL(p=>({...p,rg:v}))}/></Row>
              <AddBtn onClick={()=>{if(!formFL.name)return;setFreelancers(p=>[...p,{...formFL,id:Date.now()}]);setFormFL(emptyFL);}} color="#a78bfa">+ Cadastrar</AddBtn>
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
                    return(<div key={fl.id} style={{background:"#1e1e2e",border:`1px solid ${cor}22`,borderRadius:12,overflow:"hidden"}}>
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
                            return(<div key={c.id} style={{background:"#0f0f13",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,fontSize:12}}>
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
                    <div key={item.id} style={{background:"#1e1e2e",border:`1px solid ${cor}22`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
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
              <Row><Input label="Valor (R$)" type="number" value={formE.value} onChange={v=>setFormE(p=>({...p,value:v}))}/><Input label="📅 Data do gasto" type="date" value={formE.dateWork} onChange={v=>setFormE(p=>({...p,dateWork:v}))}/></Row>
              <Row><Input label="💰 Data pagamento" type="date" value={formE.datePay} onChange={v=>setFormE(p=>({...p,datePay:v}))}/><Select label="Categoria" value={formE.category} onChange={v=>setFormE(p=>({...p,category:v}))} options={CATEGORIES_EXPENSE}/></Row>
              <Row>
                <Select label="Natureza" value={formE.natureza||"overhead"} onChange={v=>setFormE(p=>({...p,natureza:v,jobId:v==="overhead"?"":p.jobId}))} options={["overhead","vinculado a job"]}/>
                {(formE.natureza==="vinculado a job")&&<div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Job</div><select value={formE.jobId||""} onChange={e=>setFormE(p=>({...p,jobId:Number(e.target.value)}))} style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}><option value="">Selecione...</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.desc}</option>)}</select></div>}
              </Row>
              <Select label="Status" value={formE.status} onChange={v=>setFormE(p=>({...p,status:v}))} options={["a pagar","pago"]}/>
              <AddBtn onClick={addExpense}>+ Adicionar</AddBtn>
            </FormCard>
            <SummaryPill label={`Total — ${formatBRL(totals.paidExpenses)} pagos`} value={totals.totalExpenses} color="#f87171"/>
            {expenses.length===0&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhum gasto lançado ainda.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...expenses].reverse().map(item=>(<div key={item.id} style={{background:"#1e1e2e",border:"1px solid #ffffff0a",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500,color:"#e2e8f0"}}>{item.desc}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.category}{item.dateWork&&` · 📅 ${item.dateWork}`}{item.datePay&&` · 💰 ${item.datePay}`}{item.jobId&&<span style={{color:"#a78bfa"}}> · {jobs.find(j=>j.id===item.jobId)?.desc||""}</span>}</div></div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}</div>
                <button onClick={()=>toggleStatus(expenses,setExpenses,item.id,["a pagar","pago"])} style={{background:statusColor[item.status]+"22",color:statusColor[item.status],border:`1px solid ${statusColor[item.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.status}</button>
                <button onClick={()=>startEdit("exp",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>setExpenses(p=>p.filter(e=>e.id!==item.id))} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
              </div>))}
            </div>
          </div>
        )}

        {/* ── ESTÚDIO (despesas fixas: aluguel, internet, energia...) ── */}
        {tab==="studio"&&(
          <div>
            <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Despesas fixas do estúdio: aluguel, internet, energia, água, condomínio...</p>
            <button onClick={()=>setShowAddStudio(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddStudio?"#1e1e2e":"#22d3ee22",border:"1px solid #22d3ee44",borderRadius:12,color:"#22d3ee",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddStudio?"▲ Fechar":"＋ Adicionar despesa fixa"}</button>
            {showAddStudio&&(
              <FormCard title="Nova Despesa do Estúdio" color="#22d3ee">
                <Input label="Descrição (ex: Aluguel da sala)" value={formStudio.desc} onChange={v=>setFormStudio(p=>({...p,desc:v}))}/>
                <Row><Input label="Valor mensal (R$)" type="number" value={formStudio.value} onChange={v=>setFormStudio(p=>({...p,value:v}))}/><Select label="Categoria" value={formStudio.category} onChange={v=>setFormStudio(p=>({...p,category:v}))} options={STUDIO_CATEGORIES}/></Row>
                <Row><Input label="Dia do vencimento (1-31)" type="number" value={formStudio.dayOfMonth} onChange={v=>setFormStudio(p=>({...p,dayOfMonth:v}))}/><Input label="Ativo desde" type="date" value={formStudio.dateStart} onChange={v=>setFormStudio(p=>({...p,dateStart:v}))}/></Row>
                <AddBtn onClick={addStudioExpense} color="#22d3ee">+ Adicionar</AddBtn>
              </FormCard>
            )}
            {studioExpenses.length>0&&<SummaryPill label="Total fixo mensal do estúdio" value={studioExpenses.filter(e=>e.active!==false).reduce((s,e)=>s+Number(e.value),0)} color="#22d3ee"/>}
            {studioExpenses.length===0&&!showAddStudio&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhuma despesa fixa cadastrada ainda.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {studioExpenses.map(item=>(<div key={item.id} style={{background:"#1e1e2e",border:"1px solid #ffffff0a",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:10,opacity:item.active===false?0.5:1}}>
                <span style={{fontSize:18}}>🏢</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:500,color:"#e2e8f0"}}>{item.desc}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.category}{item.dayOfMonth&&` · vence dia ${item.dayOfMonth}`}{item.active===false&&<span style={{color:"#f59e0b"}}> · inativo</span>}</div>
                </div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}<span style={{fontSize:10,color:"#64748b",fontWeight:400}}>/mês</span></div>
                <button onClick={()=>setStudioExpenses(p=>p.map(e=>e.id===item.id?{...e,active:e.active===false?true:false}:e))} style={{background:item.active===false?"#64748b22":"#22c55e22",color:item.active===false?"#64748b":"#22c55e",border:`1px solid ${item.active===false?"#64748b44":"#22c55e44"}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.active===false?"inativo":"ativo"}</button>
                <button onClick={()=>startEdit("studio",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>removeStudioExpense(item.id)} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
              </div>))}
            </div>
          </div>
        )}

        {/* ── ASSINATURAS (SaaS: Figma, Claude, Adobe...) ── */}
        {tab==="subscriptions"&&(
          <div>
            <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Assinaturas e ferramentas: Figma, Claude, Adobe, softwares em geral...</p>
            <button onClick={()=>setShowAddSub(v=>!v)} style={{width:"100%",padding:"12px",marginBottom:16,background:showAddSub?"#1e1e2e":"#facc1522",border:"1px solid #facc1544",borderRadius:12,color:"#facc15",fontWeight:600,fontSize:13,cursor:"pointer"}}>{showAddSub?"▲ Fechar":"＋ Adicionar assinatura"}</button>
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
              {subscriptions.map(item=>(<div key={item.id} style={{background:"#1e1e2e",border:"1px solid #ffffff0a",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:10,opacity:item.active===false?0.5:1}}>
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
    <div style={{fontFamily:"'Inter',sans-serif",background:"#0f0f13",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <form onSubmit={mode==="login"?handleLogin:handleSignup} style={{background:"#1e1e2e",border:"1px solid #ffffff12",borderRadius:16,padding:32,width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:8}}>🎥</div>
          <h1 style={{margin:0,fontSize:18,fontWeight:700,color:"#fff"}}>FramesBR <span style={{color:"#a78bfa"}}>Financial System</span></h1>
          <p style={{margin:"6px 0 0",fontSize:12,color:"#64748b"}}>{mode==="login"?"Faça login para continuar":"Crie sua conta gratuita"}</p>
        </div>
        <div style={{display:"flex",gap:4,background:"#0f0f13",borderRadius:8,padding:4,marginBottom:20}}>
          <button type="button" onClick={()=>{setMode("login");setError("");}} style={{flex:1,padding:"8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:mode==="login"?"#a78bfa":"transparent",color:mode==="login"?"#fff":"#64748b"}}>Entrar</button>
          <button type="button" onClick={()=>{setMode("signup");setError("");}} style={{flex:1,padding:"8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:mode==="signup"?"#a78bfa":"transparent",color:mode==="signup"?"#fff":"#64748b"}}>Criar conta</button>
        </div>
        {error && <div style={{background:"#ef444415",border:"1px solid #ef444444",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#fca5a5"}}>{error}</div>}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>E-mail</div>
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"
            style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:mode==="signup"?12:20}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Senha</div>
          <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" minLength={mode==="signup"?6:undefined}
            style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        {mode==="signup" && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Confirmar senha</div>
            <input type="password" required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="••••••••"
              style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
        )}
        <button type="submit" disabled={loading} style={{width:"100%",background:"#a78bfa",color:"#fff",border:"none",borderRadius:8,padding:"11px",fontSize:14,fontWeight:600,cursor:loading?"default":"pointer",opacity:loading?0.6:1}}>
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
      <div style={{fontFamily:"'Inter',sans-serif",background:"#0f0f13",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>🎥</div><div>Verificando login...</div></div>
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



function EditModal({fields,editData,setEditData,onSave,onCancel,color="#a78bfa"}){
  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#1e1e2e",border:`1px solid ${color}44`,borderRadius:16,padding:24,width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto"}}>
        <h3 style={{margin:"0 0 16px",fontSize:15,fontWeight:700,color}}>✏️ Editar</h3>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {fields.map(f=>(f.type==="select"
            ?<div key={f.key}><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{f.label}</div>
              <select value={editData[f.key]||""} onChange={e=>setEditData(p=>({...p,[f.key]:e.target.value}))} style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}>{f.options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}</select></div>
            :<div key={f.key}><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{f.label}</div>
              <input type={f.type||"text"} value={editData[f.key]||""} onChange={e=>setEditData(p=>({...p,[f.key]:e.target.value}))} style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>
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
function FormCard({title,color,children}){return(<div style={{background:"#1e1e2e",border:`1px solid ${color}22`,borderRadius:14,padding:20,marginBottom:20}}><h3 style={{margin:"0 0 16px",fontSize:14,fontWeight:600,color}}>{title}</h3><div style={{display:"flex",flexDirection:"column",gap:10}}>{children}</div></div>);}
function Row({children}){return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{children}</div>;}
function Input({label,value,onChange,type="text"}){return(<div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{label}</div><input type={type} value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}}/></div>);}
function Select({label,value,onChange,options}){return(<div><div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{label}</div><select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:"#0f0f13",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 10px",color:"#e2e8f0",fontSize:13,outline:"none"}}>{options.map(o=><option key={String(o)} value={o}>{o}</option>)}</select></div>);}
function AddBtn({onClick,color="#f87171",children}){return(<button onClick={onClick} style={{background:color,color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:4}}>{children}</button>);}
