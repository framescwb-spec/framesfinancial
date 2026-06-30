import { useState, useMemo, useEffect, useRef } from "react";
import { loadFromFirestore, saveToFirestore } from "./firestoreStorage.js";

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
  {id:101,clientId:1,desc:"Corpus Christi",value:15900,valorRecebido:0,nfRate:0.12,dateWork:"",datePay:"",status:"pendente"},
  {id:102,clientId:2,desc:"Coolritiba",value:17000,valorRecebido:0,nfRate:0.12,dateWork:"",datePay:"",status:"pendente"},
  {id:103,clientId:3,desc:"CBDE",value:19000,valorRecebido:0,nfRate:0.12,dateWork:"",datePay:"",status:"pendente"},
  {id:104,clientId:4,desc:"NP",value:37000,valorRecebido:0,nfRate:0.12,dateWork:"",datePay:"",status:"pendente"},
  {id:105,clientId:5,desc:"CVS",value:32000,valorRecebido:0,nfRate:0.12,dateWork:"",datePay:"2026-06-30",status:"pendente"},
  {id:106,clientId:9,desc:"GINGA",value:22000,valorRecebido:0,nfRate:0.12,dateWork:"",datePay:"",status:"pendente"},
  {id:107,clientId:7,desc:"RIO2C",value:17900,valorRecebido:0,nfRate:0.12,dateWork:"2026-06-01",datePay:"2026-06-30",status:"pendente"},
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
  {id:901,freelancerId:2,jobId:107,role:"Cinegrafista",value:2400,alimentacao:200,logistica:0,dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:902,freelancerId:1,jobId:107,role:"Editor",value:1200,alimentacao:0,logistica:0,dateWork:"2026-06-01",datePay:"",status:"a pagar"},
  {id:910,freelancerId:11,jobId:104,role:"Cinegrafista",value:0,alimentacao:0,logistica:4408,dateWork:"",datePay:"",status:"a pagar"},
  {id:911,freelancerId:10,jobId:104,role:"Cinegrafista",value:0,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:912,freelancerId:7,jobId:104,role:"Outro",value:2200,alimentacao:0,logistica:762,dateWork:"",datePay:"",status:"a pagar"},
  {id:913,freelancerId:3,jobId:104,role:"Cinegrafista",value:3600,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:914,freelancerId:1,jobId:104,role:"Diretor",value:3500,alimentacao:0,logistica:404,dateWork:"",datePay:"",status:"a pagar"},
  {id:915,freelancerId:2,jobId:104,role:"Cinegrafista",value:2800,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:916,freelancerId:5,jobId:104,role:"Produtora",value:1200,alimentacao:0,logistica:802,dateWork:"",datePay:"",status:"a pagar"},
  {id:920,freelancerId:9,jobId:101,role:"Drone",value:1200,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:921,freelancerId:11,jobId:101,role:"Cinegrafista",value:1500,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:922,freelancerId:10,jobId:101,role:"Cinegrafista",value:1500,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:923,freelancerId:3,jobId:101,role:"Cinegrafista",value:1200,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:924,freelancerId:4,jobId:101,role:"Editor",value:1000,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
  {id:925,freelancerId:2,jobId:101,role:"Assistente",value:400,alimentacao:0,logistica:0,dateWork:"",datePay:"",status:"a pagar"},
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

// Migrates old flat structure (receivables w/ project name as string) into new Client -> Job hierarchy.
// Kept for people who used the original Claude.ai artifact version of this app and are
// importing their exported data into this Firebase version for the first time.
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

async function loadFromStorage(defaults) {
  try {
    const saved = await loadFromFirestore();
    if (saved) {
      return {
        expenses: saved.expenses ?? [],
        clients: saved.clients ?? defaults.clients,
        jobs: saved.jobs ?? defaults.jobs,
        reimbursements: saved.reimbursements ?? defaults.reimbursements,
        freelancers: saved.freelancers ?? defaults.freelancers,
        caches: saved.caches ?? defaults.caches,
        projectExpenses: saved.projectExpenses ?? defaults.projectExpenses,
      };
    }
  } catch(e) { console.error("Erro ao carregar do Firestore:", e); }

  // No Firestore data found yet — try migrating from data exported out of the old
  // Claude.ai artifact (window.storage), if the person pasted it via the one-time
  // import option. See ImportLegacyData component below for how that gets here.
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

  return defaults;
}

async function saveToStorage(data) {
  try { await saveToFirestore(data); } catch(e) { console.error("Erro ao salvar no Firestore:", e); }
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);

  const [tab, setTab] = useState("dashboard");
  const [dashSubTab, setDashSubTab] = useState("geral");
  const [selectedClient, setSelectedClient] = useState(null); // client id
  const [selectedJob, setSelectedJob] = useState(null); // job id
  const [jobSubTab, setJobSubTab] = useState("equipe");
  const [showAddClient, setShowAddClient] = useState(false);
  const [draggedClientId, setDraggedClientId] = useState(null);
  const [expandedFLId, setExpandedFLId] = useState(null);
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
      setJobs(mergedJobs);

      setReimbursements(data.reimbursements);

      const savedFLIds = new Set(data.freelancers.map(f => f.id));
      setFreelancers([...data.freelancers, ...DEFAULT_FREELANCERS.filter(f => !savedFLIds.has(f.id))]);

      const savedCacheIds = new Set(data.caches.map(c => c.id));
      setCaches([...data.caches, ...DEFAULT_CACHES.filter(c => !savedCacheIds.has(c.id))]);

      const savedProjExpIds = new Set(data.projectExpenses.map(e => e.id));
      setProjectExpenses([...data.projectExpenses, ...DEFAULT_PROJ_EXPENSES.filter(e => !savedProjExpIds.has(e.id))]);

      setLoaded(true);
    });
  }, []);

  const saveTimer = useRef(null);
  const [isSavingNow, setIsSavingNow] = useState(false);

  const saveNow = async () => {
    setIsSavingNow(true);
    await saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses });
    setSavedIndicator(true);
    setIsSavingNow(false);
    setTimeout(() => setSavedIndicator(false), 2000);
  };

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveToStorage({ expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses });
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    }, 800);
  }, [expenses, clients, jobs, reimbursements, freelancers, caches, projectExpenses, loaded]);

  const emptyE = {desc:"",value:"",category:"Outros",dateWork:today(),datePay:"",status:"a pagar"};
  const emptyClient = {name:""};
  const emptyJob = {desc:"",value:"",valorRecebido:"0",nfRate:0.12,dateWork:today(),datePay:"",status:"pendente"};
  const emptyReim = {pessoa:"",desc:"",value:"",devolvidoPara:"Frames",datePay:"",status:"pendente"};
  const emptyFL = {name:"",apelido:"",role:ROLES[0],phone:"",email:"",cpf:"",rg:"",nasc:""};
  const emptyCache = {freelancerId:"",role:ROLES[0],desc:"",value:"",alimentacao:"",logistica:"",dateWork:today(),datePay:"",status:"a pagar"};
  const emptyProjExp = {type:EXPENSE_TYPES[0],desc:"",value:"",source:PAYMENT_SOURCES[0],paymentType:"à vista",parcelas:"2",dateWork:today(),datePay:"",status:"a pagar"};

  const [formE, setFormE] = useState(emptyE);
  const [formClient, setFormClient] = useState(emptyClient);
  const [formJob, setFormJob] = useState(emptyJob);
  const [formReim, setFormReim] = useState(emptyReim);
  const [formFL, setFormFL] = useState(emptyFL);
  const [formCache, setFormCache] = useState(emptyCache);
  const [formProjExp, setFormProjExp] = useState(emptyProjExp);

  const cacheTotal = (c) => Number(c.value)+Number(c.alimentacao||0)+Number(c.logistica||0);

  const startEdit = (type, item) => { setEditingId(`${type}:${item.id}`); setEditData({...item}); };
  const saveEdit = (type, setList) => { setList(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value)}:i)); setEditingId(null); setEditData({}); };
  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  // ── Totals ──
  const totals = useMemo(() => {
    const totalExpenses=expenses.reduce((s,e)=>s+Number(e.value),0);
    const paidExpenses=expenses.filter(e=>e.status==="pago").reduce((s,e)=>s+Number(e.value),0);
    const totalReceivables=jobs.reduce((s,j)=>s+Number(j.value),0);
    const received=jobs.filter(j=>j.status==="recebido").reduce((s,j)=>s+Number(j.value),0);
    const totalReimb=reimbursements.reduce((s,e)=>s+Number(e.value),0);
    const reimbReceived=reimbursements.filter(e=>e.status==="recebido").reduce((s,e)=>s+Number(e.value),0);
    const reimbPending=reimbursements.filter(e=>e.status==="pendente").reduce((s,e)=>s+Number(e.value),0);
    const totalCaches=caches.reduce((s,c)=>s+cacheTotal(c),0);
    const cachesPagos=caches.filter(c=>c.status==="pago").reduce((s,c)=>s+cacheTotal(c),0);
    const totalProjExp=projectExpenses.reduce((s,e)=>s+Number(e.value),0);
    const balance=received-paidExpenses-cachesPagos-reimbReceived;
    const projected=totalReceivables-totalExpenses-totalCaches-totalProjExp-totalReimb;
    return {totalExpenses,paidExpenses,totalReceivables,received,totalReimb,reimbReceived,reimbPending,totalCaches,cachesPagos,totalProjExp,balance,projected};
  },[expenses,jobs,reimbursements,caches,projectExpenses]);

  const monthlyData = useMemo(() => {
    const map={};
    const add=(key,field,val)=>{if(!key)return;if(!map[key])map[key]={key,income:0,expenses:0,caches:0,projExp:0,reimb:0};map[key][field]+=val;};
    jobs.filter(j=>j.status==="recebido").forEach(j=>add(monthKey(j.datePay),"income",Number(j.value)));
    reimbursements.filter(r=>r.status==="recebido").forEach(r=>add(monthKey(r.datePay),"reimb",Number(r.value)));
    expenses.forEach(e=>add(monthKey(e.datePay||e.dateWork),"expenses",Number(e.value)));
    caches.forEach(c=>add(monthKey(c.datePay||c.dateWork),"caches",cacheTotal(c)));
    projectExpenses.forEach(e=>add(monthKey(e.datePay||e.dateWork),"projExp",Number(e.value)));
    return Object.values(map).sort((a,b)=>a.key.localeCompare(b.key));
  },[jobs,reimbursements,expenses,caches,projectExpenses]);

  const reimbByPerson=useMemo(()=>{const g={};reimbursements.forEach(r=>{if(!g[r.pessoa])g[r.pessoa]=[];g[r.pessoa].push(r);});return g;},[reimbursements]);
  const personColor = {"Yago":"#818cf8","Graba":"#fb923c","Maria":"#f472b6","Patrocinado":"#34d399","Cartão Japa":"#22d3ee","Cartão Frames":"#facc15"};
  const statusColor={pago:"#22c55e","a pagar":"#f59e0b",pendente:"#f59e0b",recebido:"#22c55e"};
  const toggleStatus=(list,setList,id,options)=>setList(p=>p.map(e=>{if(e.id!==id)return e;const i=options.indexOf(e.status);return{...e,status:options[(i+1)%options.length]};}));

  const addExpense=()=>{if(!formE.desc||!formE.value)return;setExpenses(p=>[...p,{...formE,id:Date.now(),value:Number(formE.value)}]);setFormE(emptyE);};
  const addClient=()=>{if(!formClient.name)return;setClients(p=>[...p,{...formClient,id:Date.now()}]);setFormClient(emptyClient);setShowAddClient(false);};
  const removeClient=(id)=>{
    const jobIds = jobs.filter(j=>j.clientId===id).map(j=>j.id);
    setJobs(p=>p.filter(j=>j.clientId!==id));
    setCaches(p=>p.filter(c=>!jobIds.includes(c.jobId)));
    setProjectExpenses(p=>p.filter(e=>!jobIds.includes(e.jobId)));
    setClients(p=>p.filter(c=>c.id!==id));
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
    setFormJob(emptyJob);setShowAddJob(false);
  };
  const removeJob=(id)=>{setJobs(p=>p.filter(j=>j.id!==id));setCaches(p=>p.filter(c=>c.jobId!==id));setProjectExpenses(p=>p.filter(e=>e.jobId!==id));};
  const addReimb=()=>{if(!formReim.pessoa||!formReim.desc||!formReim.value)return;setReimbursements(p=>[...p,{...formReim,id:Date.now(),value:Number(formReim.value)}]);setFormReim(emptyReim);};
  const addCacheToJob=()=>{if(!formCache.freelancerId||!formCache.value)return;setCaches(p=>[...p,{...formCache,id:Date.now(),jobId:selectedJob,value:Number(formCache.value),alimentacao:Number(formCache.alimentacao||0),logistica:Number(formCache.logistica||0)}]);setFormCache(emptyCache);setShowAddFL(false);};
  const addProjectExpense=()=>{if(!formProjExp.value)return;setProjectExpenses(p=>[...p,{...formProjExp,id:Date.now(),jobId:selectedJob,value:Number(formProjExp.value)}]);setFormProjExp(emptyProjExp);setShowAddExpense(false);};
  const removeCache=(id)=>setCaches(p=>p.filter(c=>c.id!==id));
  const removeFreelancer=(id)=>{setFreelancers(p=>p.filter(f=>f.id!==id));setCaches(p=>p.filter(c=>c.freelancerId!==id));};
  const removeProjExp=(id)=>setProjectExpenses(p=>p.filter(e=>e.id!==id));

  const tabs=[{key:"profissionais",label:"👥 Profissionais"},{key:"dashboard",label:"📊 Balanço"},{key:"clients",label:"📥 Clientes"},{key:"expenses",label:"💸 Gastos"},{key:"reimbursements",label:"🔄 Reembolsos"}];

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
      <div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>🎥</div><div>Carregando dados do Firebase...</div></div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#0f0f13",minHeight:"100vh",color:"#e2e8f0",paddingBottom:60}}>
      {editingId&&editingId.startsWith("client:")&&<EditModal editData={editData} setEditData={setEditData} color="#34d399" onSave={()=>{setClients(p=>p.map(i=>i.id===editData.id?{...editData}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"name",label:"Nome do cliente"}]}/>}
      {editingId&&editingId.startsWith("job:")&&<EditModal editData={editData} setEditData={setEditData} color="#34d399" onSave={()=>{setJobs(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value),valorRecebido:Number(editData.valorRecebido||0),nfRate:Number(editData.nfRate)}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"desc",label:"Nome do projeto/job"},{key:"value",label:"Valor total (R$)",type:"number"},{key:"valorRecebido",label:"Já recebido (R$)",type:"number"},{key:"nfRate",label:"Nota Fiscal",type:"select",options:[{value:0,label:"Sem NF"},{value:0.06,label:"6%"},{value:0.12,label:"12%"}]},{key:"dateWork",label:"Data do trabalho",type:"date"},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["pendente","recebido"]}]}/>}
      {editingId&&editingId.startsWith("reimb:")&&<EditModal editData={editData} setEditData={setEditData} color="#fb923c" onSave={()=>saveEdit("reimb",setReimbursements)} onCancel={cancelEdit} fields={[{key:"pessoa",label:"Pessoa"},{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"devolvidoPara",label:"Devolvido para",type:"select",options:REIMB_SOURCES},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["pendente","recebido"]}]}/>}
      {editingId&&editingId.startsWith("cache:")&&<EditModal editData={editData} setEditData={setEditData} color="#a78bfa" onSave={()=>{setCaches(p=>p.map(i=>i.id===editData.id?{...editData,value:Number(editData.value),alimentacao:Number(editData.alimentacao||0),logistica:Number(editData.logistica||0)}:i));cancelEdit();}} onCancel={cancelEdit} fields={[{key:"role",label:"Função",type:"select",options:ROLES},{key:"desc",label:"Descrição"},{key:"value",label:"Cachê (R$)",type:"number"},{key:"alimentacao",label:"Alimentação (R$)",type:"number"},{key:"logistica",label:"Logística (R$)",type:"number"},{key:"dateWork",label:"Data do trabalho",type:"date"},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("projexp:")&&<EditModal editData={editData} setEditData={setEditData} color="#f87171" onSave={()=>saveEdit("projexp",setProjectExpenses)} onCancel={cancelEdit} fields={[{key:"type",label:"Tipo",type:"select",options:EXPENSE_TYPES},{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"source",label:"Origem",type:"select",options:PAYMENT_SOURCES},{key:"paymentType",label:"Pagamento",type:"select",options:["à vista","parcelado"]},{key:"parcelas",label:"Parcelas",type:"select",options:["2","3","4","5","6","7","8","9","10","11","12"]},{key:"dateWork",label:"Data do trabalho",type:"date"},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("exp:")&&<EditModal editData={editData} setEditData={setEditData} color="#f87171" onSave={()=>saveEdit("exp",setExpenses)} onCancel={cancelEdit} fields={[{key:"desc",label:"Descrição"},{key:"value",label:"Valor (R$)",type:"number"},{key:"category",label:"Categoria",type:"select",options:CATEGORIES_EXPENSE},{key:"dateWork",label:"Data do gasto",type:"date"},{key:"datePay",label:"Data de pagamento",type:"date"},{key:"status",label:"Status",type:"select",options:["a pagar","pago"]}]}/>}
      {editingId&&editingId.startsWith("fl:")&&<EditModal editData={editData} setEditData={setEditData} color="#a78bfa" onSave={()=>{setFreelancers(p=>p.map(i=>i.id===editData.id?{...editData}:i));setEditingId(null);setEditData({});}} onCancel={cancelEdit} fields={[{key:"name",label:"Nome completo"},{key:"apelido",label:"Apelido"},{key:"role",label:"Função",type:"select",options:ROLES},{key:"phone",label:"WhatsApp"},{key:"email",label:"E-mail"},{key:"cpf",label:"CPF"},{key:"rg",label:"RG"},{key:"nasc",label:"Nascimento"}]}/>}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)",borderBottom:"1px solid #ffffff12",padding:"24px 24px 0"}}>
        <div style={{maxWidth:820,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#fff"}}>🎥 FramesBR <span style={{color:"#a78bfa"}}>Financial System</span></h1>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:11,color:savedIndicator?"#22c55e":"#334155",transition:"color .3s"}}>{savedIndicator?"✅ Salvo no Firebase":"☁️ Conectado ao Firebase"}</span>
              <button onClick={saveNow} disabled={isSavingNow} style={{background:"#34d39922",border:"1px solid #34d39944",color:"#34d399",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:isSavingNow?"default":"pointer",opacity:isSavingNow?0.6:1,display:"flex",alignItems:"center",gap:4}}>
                {isSavingNow?"Salvando...":"💾 Salvar agora"}
              </button>
            </div>
          </div>
          <p style={{margin:"0 0 20px",fontSize:13,color:"#94a3b8"}}>Clientes · Projetos · Profissionais · Gastos</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {tabs.map(t=>(<button key={t.key} onClick={()=>{setTab(t.key);setSelectedClient(null);setSelectedJob(null);setShowAddFL(false);setShowAddExpense(false);setShowAddClient(false);setShowAddJob(false);}} style={{padding:"8px 14px",border:"none",cursor:"pointer",fontSize:12,fontWeight:500,background:tab===t.key?"#a78bfa":"transparent",color:tab===t.key?"#fff":"#94a3b8",borderRadius:"8px 8px 0 0",transition:"all .15s"}}>{t.label}</button>))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",padding:"24px 24px 0"}}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {[{key:"geral",label:"📊 Geral"},{key:"mensal",label:"📅 Por Mês"}].map(st=>(<button key={st.key} onClick={()=>setDashSubTab(st.key)} style={{padding:"8px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,borderRadius:8,background:dashSubTab===st.key?"#a78bfa":"#1e1e2e",color:dashSubTab===st.key?"#fff":"#64748b"}}>{st.label}</button>))}
            </div>
            {dashSubTab==="geral"&&(<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                {[{label:"Saldo Atual",value:totals.balance,color:totals.balance>=0?"#22c55e":"#ef4444",sub:"recebido − gastos − cachês pagos − reembolsos pagos"},{label:"Projetado Total",value:totals.projected,color:"#a78bfa",sub:"clientes − custos − reembolsos a pagar"},{label:"Clientes (total)",value:totals.totalReceivables,color:"#34d399",sub:`${formatBRL(totals.received)} já recebido`},{label:"Gastos nos projetos",value:totals.totalProjExp+totals.totalCaches,color:"#f87171",sub:`${formatBRL(totals.totalCaches)} cachês · ${formatBRL(totals.totalProjExp)} despesas`}].map(c=>(
                  <div key={c.label} style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"18px 20px"}}>
                    <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{c.label}</div>
                    <div style={{fontSize:22,fontWeight:700,color:c.color}}>{formatBRL(c.value)}</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:4}}>{c.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"20px",marginBottom:16}}>
                <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#cbd5e1"}}>💳 Reembolsos a fazer (adiantamentos)</h3>
                {Object.entries(reimbByPerson).map(([pessoa,items])=>{
                  const total=items.reduce((s,i)=>s+i.value,0);const cor=personColor[pessoa]||"#94a3b8";
                  return(<div key={pessoa} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:13,fontWeight:600,color:cor}}>{pessoa}</span><span style={{fontSize:13,fontWeight:700,color:"#fff"}}>{formatBRL(total)}</span></div>
                    {items.map(i=>(<div key={i.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748b",padding:"2px 0 2px 12px",borderLeft:`2px solid ${cor}44`}}><span>{i.desc}</span><span style={{color:i.status==="recebido"?"#22c55e":"#f59e0b"}}>{formatBRL(i.value)}</span></div>))}
                  </div>);
                })}
              </div>
              <div style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"20px"}}>
                <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#cbd5e1"}}>🏢 Balanço por cliente</h3>
                {clients.map(cl=>{
                  const ct=clientTotals(cl.id);
                  if(ct.jobCount===0)return null;
                  const cor=getColor(cl.id);
                  return(<div key={cl.id} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:cor}}/><span style={{fontSize:13,color:"#cbd5e1"}}>{cl.name}</span><span style={{fontSize:11,color:"#475569"}}>({ct.jobCount} job{ct.jobCount>1?"s":""})</span></div>
                      <span style={{fontSize:13,fontWeight:700,color:ct.margem>=0?"#22c55e":"#ef4444"}}>{formatBRL(ct.margem)}</span>
                    </div>
                  </div>);
                })}
                {clients.every(cl=>clientTotals(cl.id).jobCount===0)&&<div style={{fontSize:12,color:"#475569"}}>Nenhum job lançado ainda.</div>}
              </div>
            </>)}
            {dashSubTab==="mensal"&&(
              <div>
                <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>Baseado nas datas de trabalho/pagamento dos lançamentos.</p>
                {monthlyData.length===0&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>Adicione datas nos lançamentos para ver o balanço mensal.</div>}
                {monthlyData.map(m=>{
                  const saldo=m.income-m.expenses-m.caches-m.projExp-m.reimb;
                  return(<div key={m.key} style={{background:"#1e1e2e",border:"1px solid #ffffff0f",borderRadius:14,padding:"18px 20px",marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><span style={{fontSize:15,fontWeight:700,color:"#fff"}}>{monthLabel(m.key)}</span><span style={{fontSize:16,fontWeight:700,color:saldo>=0?"#22c55e":"#ef4444"}}>{formatBRL(saldo)}</span></div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <div style={{background:"#34d39910",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>📥 Entradas</div><div style={{fontSize:14,fontWeight:700,color:"#34d399"}}>{formatBRL(m.income)}</div></div>
                      <div style={{background:"#f8717110",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>💸 Saídas</div><div style={{fontSize:14,fontWeight:700,color:"#f87171"}}>{formatBRL(m.expenses+m.caches+m.projExp+m.reimb)}</div></div>
                      {m.caches>0&&<div style={{background:"#a78bfa10",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>👥 Cachês</div><div style={{fontSize:13,fontWeight:600,color:"#a78bfa"}}>{formatBRL(m.caches)}</div></div>}
                      {m.projExp>0&&<div style={{background:"#fb923c10",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>🧾 Despesas proj.</div><div style={{fontSize:13,fontWeight:600,color:"#fb923c"}}>{formatBRL(m.projExp)}</div></div>}
                      {m.reimb>0&&<div style={{background:"#f59e0b10",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:10,color:"#64748b"}}>🔄 Reembolsos pagos</div><div style={{fontSize:13,fontWeight:600,color:"#f59e0b"}}>{formatBRL(m.reimb)}</div></div>}
                    </div>
                  </div>);
                })}
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
                <Row><Input label="Data do trabalho" type="date" value={formJob.dateWork} onChange={v=>setFormJob(p=>({...p,dateWork:v}))}/><Input label="Data de pagamento" type="date" value={formJob.datePay} onChange={v=>setFormJob(p=>({...p,datePay:v}))}/></Row>
                <Row>
                  <div><div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Nota Fiscal</div>
                    <div style={{display:"flex",gap:4,background:"#0f0f13",borderRadius:8,padding:4}}>
                      {[{label:"Sem NF",value:0},{label:"6%",value:0.06},{label:"12%",value:0.12}].map(opt=>(<button key={opt.label} onClick={()=>setFormJob(p=>({...p,nfRate:opt.value}))} style={{flex:1,padding:"6px 8px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:formJob.nfRate===opt.value?"#f87171":"transparent",color:formJob.nfRate===opt.value?"#fff":"#475569"}}>{opt.label}</button>))}
                    </div>
                  </div>
                  <Select label="Status" value={formJob.status} onChange={v=>setFormJob(p=>({...p,status:v}))} options={["pendente","recebido"]}/>
                </Row>
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
                      <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{job.desc}</div>
                      <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{job.dateWork&&<span>📅 {job.dateWork}</span>}{job.dateWork&&job.datePay&&<span> · </span>}{job.datePay&&<span>💰 {job.datePay}</span>}{job.nfRate>0&&<span> · NF {job.nfRate*100}%</span>}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(job.value)}</div>
                    <button onClick={(e)=>{e.stopPropagation();toggleStatus(jobs,setJobs,job.id,["pendente","recebido"]);}} style={{background:statusColor[job.status]+"22",color:statusColor[job.status],border:`1px solid ${statusColor[job.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{job.status}</button>
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
              {(()=>{const clientVal=Number(currentJob.value)||0;const rate=Number(currentJob.nfRate)||0;const nf=clientVal*rate;const liquido=clientVal-nf;const margem=liquido-currentJobTotal;const jaRecebido=Number(currentJob.valorRecebido||0);const saldoDevedor=clientVal-jaRecebido;return(<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:"#34d39910",border:"1px solid #34d39930",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Valor do job</div><div style={{fontSize:16,fontWeight:700,color:"#34d399"}}>{formatBRL(clientVal)}</div><div style={{fontSize:10,color:statusColor[currentJob.status]}}>{currentJob.status}</div></div>
                  <div style={{background:rate>0?"#f8717115":"#ffffff08",border:`1px solid ${rate>0?"#f8717130":"#ffffff10"}`,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>Nota Fiscal{rate>0?` (${rate*100}%)`:""}</div><div style={{fontSize:16,fontWeight:700,color:rate>0?"#f87171":"#334155"}}>{rate>0?`− ${formatBRL(nf)}`:"Sem desconto"}</div></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{background:"#22c55e12",border:"1px solid #22c55e33",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>✅ Já recebido</div><div style={{fontSize:16,fontWeight:700,color:"#22c55e"}}>{formatBRL(jaRecebido)}</div></div>
                  <div style={{background:saldoDevedor>0?"#f59e0b12":"#22c55e12",border:`1px solid ${saldoDevedor>0?"#f59e0b33":"#22c55e33"}`,borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:11,color:"#64748b"}}>⏳ Saldo devedor</div><div style={{fontSize:16,fontWeight:700,color:saldoDevedor>0?"#f59e0b":"#22c55e"}}>{formatBRL(saldoDevedor)}</div></div>
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
                        <Row><Input label="📅 Data do trabalho" type="date" value={formCache.dateWork} onChange={v=>setFormCache(p=>({...p,dateWork:v}))}/><Input label="💰 Data de pagamento" type="date" value={formCache.datePay} onChange={v=>setFormCache(p=>({...p,datePay:v}))}/></Row>
                        <Select label="Status" value={formCache.status} onChange={v=>setFormCache(p=>({...p,status:v}))} options={["a pagar","pago"]}/>
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
                        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{fl?.name||"—"}{c.desc&&<span style={{color:"#64748b",fontWeight:400}}> — {c.desc}</span>}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{c.role}{c.dateWork&&` · 📅 ${c.dateWork}`}{c.datePay&&` · 💰 ${c.datePay}`}</div></div>
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
                  {freelancers.map((fl,idx)=>{
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
              <Row><Select label="Devolvido para" value={formReim.devolvidoPara} onChange={v=>setFormReim(p=>({...p,devolvidoPara:v}))} options={REIMB_SOURCES}/><Select label="Status" value={formReim.status} onChange={v=>setFormReim(p=>({...p,status:v}))} options={["pendente","recebido"]}/></Row>
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
              <Select label="Status" value={formE.status} onChange={v=>setFormE(p=>({...p,status:v}))} options={["a pagar","pago"]}/>
              <AddBtn onClick={addExpense}>+ Adicionar</AddBtn>
            </FormCard>
            <SummaryPill label={`Total — ${formatBRL(totals.paidExpenses)} pagos`} value={totals.totalExpenses} color="#f87171"/>
            {expenses.length===0&&<div style={{textAlign:"center",color:"#475569",padding:30,fontSize:13}}>Nenhum gasto lançado ainda.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...expenses].reverse().map(item=>(<div key={item.id} style={{background:"#1e1e2e",border:"1px solid #ffffff0a",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500,color:"#e2e8f0"}}>{item.desc}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{item.category}{item.dateWork&&` · 📅 ${item.dateWork}`}{item.datePay&&` · 💰 ${item.datePay}`}</div></div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{formatBRL(item.value)}</div>
                <button onClick={()=>toggleStatus(expenses,setExpenses,item.id,["a pagar","pago"])} style={{background:statusColor[item.status]+"22",color:statusColor[item.status],border:`1px solid ${statusColor[item.status]}44`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{item.status}</button>
                <button onClick={()=>startEdit("exp",item)} style={{background:"#ffffff10",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,borderRadius:6,padding:"4px 8px"}}>✏️</button>
                <button onClick={()=>setExpenses(p=>p.filter(e=>e.id!==item.id))} style={{background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
              </div>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
