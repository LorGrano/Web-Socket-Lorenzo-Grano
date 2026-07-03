// Estrazoine dalle API globali di Vue e Vue Router solo le funzioni che ci servono,
// così da poterle usare direttamente senza il prefisso "Vue." / "VueRouter."
const { ref, onMounted, onUnmounted, watch } = Vue;
const { createRouter, createWebHashHistory, RouterView, RouterLink } = VueRouter;

// Pagina "statica": nessuna logica, si limita a renderizzare il template
// con la spiegazione teorica del protocollo WebSocket
const PageWebSocket = {
    template: '#tpl-statica1'
};

// Pagina "statica" gemella della precedente, ma dedicata a Socket.io
const PageSocketIo = {
    template: '#tpl-statica2'
};

// Pagina "dinamica": al mount va a recuperare l'elenco dei simulatori
// da un file JSON esterno e lo mostra a video tramite v-for nel template
const PageSimulatori = {
    template: '#tmpl-dinamica1',
    setup() {
        // Array reattivo che conterrà i dati letti dal JSON
        const simulatori = ref([]);

        // Funzione asincrona che effettua la fetch del JSON statico.
        // Il timestamp in query string (?v=...) serve a "bucare" la cache
        // del browser e ottenere sempre l'ultima versione del file
        const recuperaDatiSimulatori = async () => {
            try {
                const response = await fetch(`simulatori.json?v=${Date.now()}`);
                if (response.ok) {
                    simulatori.value = await response.json();
                }
            } catch (error) {
                console.error("Impossibile caricare il file JSON esterno:", error);
            }
        };

        // Il caricamento parte appena il componente viene montato nel DOM
        onMounted(() => recuperaDatiSimulatori());

        return { simulatori };
    }
};

// Pagina "dinamica" più complessa: combina un CRUD di note (persistito in
// localStorage) con una simulazione di telemetria live animata via Canvas/SVG
const PageTelemetria = {
    template: '#tmpl-dinamica2',
    setup() {
        // Elenco strutturato dei 6 simulatori per popolare dinamicamente la select
        const listaOpzioniSimulatori = ref([
            "Assetto Corsa Competizione",
            "Assetto Corsa",
            "iRacing",
            "rFactor 2",
            "Automobilista 2",
            "F1 23"
        ]);

        // --- Stato del CRUD note ---
        const note = ref([]);                                  // elenco note salvate
        const formNota = ref({ id: null, simulatore: '', circuito: '', auto: '', tempoGiro: '', note: '' }); // dati del form (creazione/modifica)
        const isEditing = ref(false);                           // true se stiamo modificando una nota esistente

        // --- Stato della telemetria live ---
        const liveTelemetry = ref({ rpm: 0, speed: 0, n_gear: 1 }); // valori correnti mostrati nei contagiri/tachimetro
        let animationFrameId = null;                                 // id restituito da requestAnimationFrame, serve per poterlo cancellare

        // Angoli (in gradi) delle lancette degli strumenti, usati per la rotazione SVG
        const currentAngleRpm = ref(-135);
        const currentAngleSpeed = ref(-135);

        // Flag e contatori per la fase iniziale di "boot" degli strumenti
        // (l'effetto delle lancette che salgono a fondo scala e poi ridiscendono,
        // tipico dei cruscotti digitali all'accensione)
        const isBooting = ref(true);
        let bootProgress = 0;
        let currentIndex = 0;          // indice del "frame" corrente nello stream simulato
        let interpolationFactor = 0;   // quanto siamo avanti nella transizione tra un frame e il successivo (0-1)
        const interpolationSpeed = 0.015; // velocità di avanzamento dell'interpolazione

        // Sequenza di dati di telemetria "finti" (rpm/velocità/marcia) che viene
        // ripetuta in loop per simulare un giro di pista realistico
        const openF1TelemetryStream = [
            { rpm: 5200, speed: 115, n_gear: 2 },  { rpm: 7800, speed: 145, n_gear: 3 },
            { rpm: 9600, speed: 185, n_gear: 3 },  { rpm: 11400, speed: 220, n_gear: 4 },
            { rpm: 12200, speed: 265, n_gear: 5 },  { rpm: 12500, speed: 302, n_gear: 6 },
            { rpm: 4800, speed: 95, n_gear: 2 },   { rpm: 6900, speed: 130, n_gear: 2 },
            { rpm: 9800, speed: 185, n_gear: 3 },  { rpm: 11800, speed: 245, n_gear: 5 },
            { rpm: 12400, speed: 295, n_gear: 6 },  { rpm: 4100, speed: 82, n_gear: 1 },
            { rpm: 7500, speed: 135, n_gear: 3 },   { rpm: 10400, speed: 210, n_gear: 4 },
            { rpm: 4300, speed: 85, n_gear: 2 },   { rpm: 7200, speed: 140, n_gear: 3 },
            { rpm: 10900, speed: 235, n_gear: 5 },  { rpm: 4600, speed: 92, n_gear: 2 },
            { rpm: 8200, speed: 155, n_gear: 3 },  { rpm: 11100, speed: 240, n_gear: 5 },
            { rpm: 3900, speed: 78, n_gear: 1 },   { rpm: 7100, speed: 122, n_gear: 2 }
        ];

        // Carica le note da localStorage; se non ce ne sono ancora,
        // inizializza con una nota di esempio "demo"
        const caricaNote = () => {
            const noteSalvate = localStorage.getItem('sim_racing_notes');
            if (noteSalvate && JSON.parse(noteSalvate).length > 0) {
                note.value = JSON.parse(noteSalvate);
            } else {
                note.value = [{ id: Date.now(), simulatore: "Assetto Corsa Competizione", circuito: "Vallelunga", auto: "Mazda RX-7 FD", tempoGiro: "1:38:146", note: "Problemi bloccaggio anteriore sinistra in staccata Cimini, problema alleggerimento posteriore al curvone per cui necessario alzare il piede" }];
                localStorage.setItem('sim_racing_notes', JSON.stringify(note.value));
            }
        };

        // Salva una nota: se siamo in modalità modifica aggiorna il record
        // esistente (cercandolo per id), altrimenti ne crea uno nuovo in testa
        // alla lista (usando il timestamp corrente come id univoco)
        const salvaNota = () => {
            if (!formNota.value.simulatore || !formNota.value.circuito || !formNota.value.auto || !formNota.value.tempoGiro) {
                window.alert("Attenzione: valorizzare tutti i campi obbligatori prima di salvare!");
                return;
            }
            if (isEditing.value) {
                const index = note.value.findIndex(n => n.id === formNota.value.id);
                if (index !== -1) note.value[index] = { ...formNota.value };
                isEditing.value = false;
            } else {
                note.value.unshift({ ...formNota.value, id: Date.now() // impostazione del valore id con il timestamp dell'inserimento per evitare id nulli o duplicati
                                                                       // che andrebbero a creare eliminazioni massive/errate e modifiche imprevedibili
                });
            }
            localStorage.setItem('sim_racing_notes', JSON.stringify(note.value));
            resetForm();
        };

        // Rimuove una nota per id e aggiorna localStorage;
        // se stavamo modificando proprio quella nota, annulla la modifica in corso
        const eliminaNota = (id) => {
            if (window.confirm("Sei sicuro di voler eliminare questa nota?")) // Mesaggio di conferma del browser per evitare accidentale cancellazione
            if (isEditing.value && formNota.value.id == id) { // Prima di eliminare viene verificato se la nota è in modifica e nel caso l'utente viene bloccato
                window.alert("Impossibile eliminare la nota: è attualmente in corso la modifica!");
                return;
            }
            note.value = note.value.filter(n => n.id !== id);
            localStorage.setItem('sim_racing_notes', JSON.stringify(note.value));
            if (isEditing.value && formNota.value.id === id) annullaModifica();
        };

        // Precompila il form con i dati della nota selezionata e attiva la modalità modifica
        const avviaModifica = (nota) => { formNota.value = { ...nota }; isEditing.value = true; };
        // Esce dalla modalità modifica riportando il form allo stato vuoto
        const annullaModifica = () => { resetForm(); isEditing.value = false; };
        // Svuota i campi del form
        const resetForm = () => { formNota.value = { id: null, simulatore: '', circuito: '', auto: '', tempoGiro: '', note: '' }; };

        // Converte un valore (es. rpm o velocità) in un angolo per la lancetta SVG,
        // su un quadrante che va da -135° a +135° (270° totali di escursione)
        const getTargetAngle = (value, max) => -135 + (270 * Math.min(Math.max(value / max, 0), 1));
        // Interpolazione lineare classica tra due valori, in base a un fattore 0-1
        const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

        // Punto (in percentuale di avanzamento del cambio marcia) in cui i giri
        // toccano il minimo durante il "buco" di coppia tipico di un cambio marcia
        const SHIFT_DIP_POINT = 0.22;

        // Simula l'andamento dei giri motore durante un cambio marcia: prima
        // scendono rapidamente verso un valore minimo ("dip"), poi risalgono
        // verso il regime della marcia successiva, per un effetto più realistico
        const rpmDuranteCambioMarcia = (factor, fromRpm, toRpm) => {
            const dipRpm = Math.min(fromRpm, toRpm) * 0.62;
            if (factor < SHIFT_DIP_POINT) {
                return lerp(fromRpm, dipRpm, factor / SHIFT_DIP_POINT);
            }
            return lerp(dipRpm, toRpm, (factor - SHIFT_DIP_POINT) / (1 - SHIFT_DIP_POINT));
        };

        // Cuore dell'animazione: viene richiamata ad ogni frame tramite
        // requestAnimationFrame e aggiorna rpm/velocità/marcia visualizzati
        const loopTelemetriaHardware = () => {
            if (isBooting.value) {
                // Fase 1 del boot: le lancette salgono verso il fondo scala
                if (bootProgress < 1) {
                    bootProgress += 0.02;
                    liveTelemetry.value.rpm   = lerp(0, 13000, Math.pow(bootProgress, 0.7));
                    liveTelemetry.value.speed = lerp(0, 320,   Math.max(0, (bootProgress - 0.35) / 0.65));
                    liveTelemetry.value.n_gear = Math.min(Math.floor(bootProgress * 8) + 1, 8);
                } else if (bootProgress < 2) {
                    // Fase 2 del boot: le lancette ridiscendono verso il primo valore reale dello stream
                    bootProgress += 0.03;
                    const returnFactor = bootProgress - 1;
                    liveTelemetry.value.rpm   = lerp(13000, openF1TelemetryStream[0].rpm,   returnFactor);
                    liveTelemetry.value.speed = lerp(320,   openF1TelemetryStream[0].speed, returnFactor);
                    liveTelemetry.value.n_gear = 2;
                } else { isBooting.value = false; }
            } else {
                // Fase "a regime": interpoliamo tra il record corrente e il successivo
                // dello stream simulato, per ottenere un movimento fluido delle lancette
                const nextIndex = (currentIndex + 1) % openF1TelemetryStream.length;
                const currentRecord = openF1TelemetryStream[currentIndex];
                const nextRecord = openF1TelemetryStream[nextIndex];
                interpolationFactor += interpolationSpeed;
                if (interpolationFactor >= 1) { interpolationFactor = 0; currentIndex = nextIndex; }
                const cambiaMarcia = currentRecord.n_gear !== nextRecord.n_gear;
                // Se tra un record e l'altro cambia la marcia, usiamo la curva con il "dip" di coppia,
                // altrimenti una semplice interpolazione lineare
                const targetRpm = cambiaMarcia
                    ? rpmDuranteCambioMarcia(interpolationFactor, currentRecord.rpm, nextRecord.rpm)
                    : lerp(currentRecord.rpm, nextRecord.rpm, interpolationFactor);
                const targetSpeed = lerp(currentRecord.speed, nextRecord.speed, interpolationFactor);
                // Smorziamo ulteriormente il movimento delle lancette (easing) per renderlo meno scattoso:
                // l'rpm segue più "nervosamente" il target, la velocità in modo più morbido
                liveTelemetry.value.rpm = lerp(liveTelemetry.value.rpm, targetRpm, 0.25);
                liveTelemetry.value.speed = lerp(liveTelemetry.value.speed, targetSpeed, 0.05);
                // La marcia visualizzata scatta al nuovo valore solo dopo una certa soglia di interpolazione
                const sogliaCambio = cambiaMarcia ? SHIFT_DIP_POINT : 0.5;
                liveTelemetry.value.n_gear = interpolationFactor > sogliaCambio ? nextRecord.n_gear : currentRecord.n_gear;
            }
            // Ricalcoliamo gli angoli delle lancette in base ai nuovi valori di rpm/velocità
            currentAngleRpm.value   = getTargetAngle(liveTelemetry.value.rpm,   13000);
            currentAngleSpeed.value = getTargetAngle(liveTelemetry.value.speed, 320);
            // Pianifichiamo il prossimo frame dell'animazione
            animationFrameId = requestAnimationFrame(loopTelemetriaHardware);
        };

        // All'avvio del componente: carichiamo le note salvate e resettiamo
        // lo stato dell'animazione, poi facciamo partire il loop di telemetria
        onMounted(() => {
            caricaNote();
            isBooting.value = true;
            bootProgress = 0;
            currentIndex = 0;
            interpolationFactor = 0;
            currentAngleRpm.value = -135;
            currentAngleSpeed.value = -135;
            animationFrameId = requestAnimationFrame(loopTelemetriaHardware);
        });

        // Quando il componente viene smontato (es. cambio pagina) fermiamo
        // l'animazione per evitare loop "fantasma" e memory leak
        onUnmounted(() => { if (animationFrameId) cancelAnimationFrame(animationFrameId); });

        return {
            note, formNota, isEditing, liveTelemetry, isBooting,
            currentAngleRpm, currentAngleSpeed, listaOpzioniSimulatori,
            salvaNota, eliminaNota, avviaModifica, annullaModifica
        };
    }
};

// Mappa URL -> componente. Ogni voce del menu corrisponde a una rotta.
// L'ultima è un "catch-all" che reindirizza alla home qualsiasi path non riconosciuto
const routes = [
    { path: '/',           component: PageWebSocket,  name: 'websocket'   },
    { path: '/socketio',   component: PageSocketIo,   name: 'socketio'    },
    { path: '/simulatori', component: PageSimulatori, name: 'simulatori'  },
    { path: '/telemetria', component: PageTelemetria, name: 'telemetria'  },
    { path: '/:pathMatch(.*)*', redirect: '/' }
];

// Usiamo l'history basata su hash (#/...) così l'app funziona anche aprendo
// il file index.html direttamente, senza bisogno di un server configurato
// per il routing lato client
const router = createRouter({
    history: createWebHashHistory(),
    routes
});

// Componente radice: gestisce solo l'apertura/chiusura del menu mobile
// (hamburger) e fa da contenitore per l'header e il <router-view>
const appRoot = {
    setup() {
        const isMenuOpen = ref(false);
        const toggleMenu = () => { isMenuOpen.value = !isMenuOpen.value; };
        const closeMenu  = () => { isMenuOpen.value = false; };

        // Il div #app parte nascosto (style="display:none" nell'HTML) per evitare
        // il flash dei template non ancora compilati da Vue; lo rendiamo visibile
        // solo a montaggio avvenuto
        onMounted(() => {
            const appEl = document.getElementById('app');
            if (appEl) appEl.style.display = '';
        });

        return { isMenuOpen, toggleMenu, closeMenu };
    },
    template: '#tpl-app-root'
};

// Creiamo l'app Vue, agganciamo il router e registriamo globalmente
// i componenti RouterView/RouterLink, infine montiamo tutto su #app
Vue.createApp(appRoot)
    .use(router)
    .component('RouterView', RouterView)
    .component('RouterLink', RouterLink)
    .mount('#app');