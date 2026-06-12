const { ref, onMounted, onUnmounted, watch } = Vue;

const appLogic = {
    setup() {
        const currentView = ref('statica1');
        const isMenuOpen = ref(false);

        const simulatori = ref([
            { "id": "sim_01", "name": "iRacing", "developer": "iRacing.com", "logo": "img/iRacing_logo.png", "telemetry_features": { "frequency_hz": 60 }, "is_active_broadcasting": true },
            { "id": "sim_02", "name": "rFactor 2", "developer": "Studio 397", "logo": "img/RFactor2_Logo.png", "telemetry_features": { "frequency_hz": 100 }, "is_active_broadcasting": false },
            { "id": "sim_03", "name": "Assetto Corsa Competizione", "developer": "Kunos Simulazioni", "logo": "img/ASC_Logo.png", "telemetry_features": { "frequency_hz": 400 }, "is_active_broadcasting": true }
        ]);

        const note = ref([]);
        const formNota = ref({ id: null, simulatore: '', circuito: '', auto: '', tempoGiro: '', note: '' });
        const isEditing = ref(false);
        
        const liveTelemetry = ref({ rpm: 0, speed: 0, n_gear: 1 });
        let animationFrameId = null;
        
        const currentAngleRpm = ref(-135);
        const currentAngleSpeed = ref(-135);

        const isBooting = ref(true);
        let bootProgress = 0; 
        let currentIndex = 0;
        let interpolationFactor = 0;
        const interpolationSpeed = 0.015; 

        const openF1TelemetryStream = [
            { rpm: 5200, speed: 115, n_gear: 2 },  
            { rpm: 7800, speed: 145, n_gear: 3 },
            { rpm: 9600, speed: 185, n_gear: 3 },
            { rpm: 11400, speed: 220, n_gear: 4 }, 
            { rpm: 12200, speed: 265, n_gear: 5 }, 
            { rpm: 12500, speed: 302, n_gear: 6 }, 
            { rpm: 4800, speed: 95, n_gear: 2 },   
            { rpm: 6900, speed: 130, n_gear: 2 },
            { rpm: 9800, speed: 185, n_gear: 3 },  
            { rpm: 11800, speed: 245, n_gear: 5 }, 
            { rpm: 12400, speed: 295, n_gear: 6 }, 
            { rpm: 4100, speed: 82, n_gear: 1 },   
            { rpm: 7500, speed: 135, n_gear: 3 },  
            { rpm: 10400, speed: 210, n_gear: 4 }, 
            { rpm: 4300, speed: 85, n_gear: 2 },   
            { rpm: 7200, speed: 140, n_gear: 3 },
            { rpm: 10900, speed: 235, n_gear: 5 }, 
            { rpm: 4600, speed: 92, n_gear: 2 },   
            { rpm: 8200, speed: 155, n_gear: 3 },
            { rpm: 11100, speed: 240, n_gear: 5 }, 
            { rpm: 3900, speed: 78, n_gear: 1 },   
            { rpm: 7100, speed: 122, n_gear: 2 }   
        ];

        const caricaNote = () => {
            const noteSalvate = localStorage.getItem('sim_racing_notes');
            if (noteSalvate && JSON.parse(noteSalvate).length > 0) {
                note.value = JSON.parse(noteSalvate);
            } else {
                const noteIniziali = [
                    { id: 1, simulatore: "Assetto Corsa Competizione", circuito: "Vallelunga", auto: "Mazda RX-7 FD", tempoGiro: "1:38:146", note: "Problemi bloccaggio anteriore sinistra in staccata Cimini, problema alleggerimento posteriore al curvone per cui necessario alzare il piede" }
                ];
                note.value = noteIniziali;
                localStorage.setItem('sim_racing_notes', JSON.stringify(noteIniziali));
            }
        };

        const salvaNota = () => {
            if (!formNota.value.simulatore || 
                !formNota.value.circuito || 
                !formNota.value.auto || 
                !formNota.value.tempoGiro) {
                
                window.alert("Attenzione: valorizzare tutti i campi obbligatori prima di salvare!");
                return;
            }

            if (isEditing.value) {
                const index = note.value.findIndex(n => n.id === formNota.value.id);
                if (index !== -1) note.value[index] = { ...formNota.value };
                isEditing.value = false;
            } else {
                const nuovaNota = { 
                    id: Date.now(), 
                    simulatore: formNota.value.simulatore, 
                    circuito: formNota.value.circuito, 
                    auto: formNota.value.auto, 
                    tempoGiro: formNota.value.tempoGiro,
                    note: formNota.value.note
                };
                note.value.unshift(nuovaNota); 
            }
            
            localStorage.setItem('sim_racing_notes', JSON.stringify(note.value));
            resetForm();
        };

        const eliminaNota = (id) => {
            note.value = note.value.filter(n => n.id !== id);
            localStorage.setItem('sim_racing_notes', JSON.stringify(note.value));
            if (isEditing.value && formNota.value.id === id) annullaModifica();
        };

        const avviaModifica = (nota) => { formNota.value = { ...nota }; isEditing.value = true; };
        const annullaModifica = () => { resetForm(); isEditing.value = false; };
        const resetForm = () => { formNota.value = { id: null, simulatore: '', circuito: '', auto: '', tempoGiro: '', note: '' }; };

        const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

        const getTargetAngle = (value, max) => {
            const ratio = Math.min(Math.max(value / max, 0), 1);
            return -135 + (270 * ratio);
        };

        const loopTelemetriaHardware = () => {
            if (isBooting.value) {
                if (bootProgress < 1) {
                    bootProgress += 0.02; 
                    liveTelemetry.value.rpm = lerp(0, 13000, bootProgress);
                    liveTelemetry.value.speed = lerp(0, 320, bootProgress);
                    liveTelemetry.value.n_gear = Math.min(Math.floor(bootProgress * 8) + 1, 8);
                } else if (bootProgress < 2) {
                    bootProgress += 0.03;
                    const returnFactor = bootProgress - 1;
                    liveTelemetry.value.rpm = lerp(13000, openF1TelemetryStream[0].rpm, returnFactor);
                    liveTelemetry.value.speed = lerp(320, openF1TelemetryStream[0].speed, returnFactor);
                    liveTelemetry.value.n_gear = 2;
                } else {
                    isBooting.value = false;
                }
            } else {
                const nextIndex = (currentIndex + 1) % openF1TelemetryStream.length;
                const currentRecord = openF1TelemetryStream[currentIndex];
                const nextRecord = openF1TelemetryStream[nextIndex];

                interpolationFactor += interpolationSpeed;

                if (interpolationFactor >= 1) {
                    interpolationFactor = 0;
                    currentIndex = nextIndex;
                }

                liveTelemetry.value.speed = lerp(currentRecord.speed, nextRecord.speed, interpolationFactor);
                liveTelemetry.value.rpm = lerp(currentRecord.rpm, nextRecord.rpm, interpolationFactor);
                liveTelemetry.value.n_gear = interpolationFactor > 0.5 ? nextRecord.n_gear : currentRecord.n_gear;
            }

            const targetAngleRpm = getTargetAngle(liveTelemetry.value.rpm, 13000);
            const targetAngleSpeed = getTargetAngle(liveTelemetry.value.speed, 320);

            currentAngleRpm.value = lerp(currentAngleRpm.value, targetAngleRpm, 0.12);
            currentAngleSpeed.value = lerp(currentAngleSpeed.value, targetAngleSpeed, 0.12);

            animationFrameId = requestAnimationFrame(loopTelemetriaHardware);
        };

        watch(currentView, (newView) => {
            if (newView === 'dinamica2') {
                isBooting.value = true;
                bootProgress = 0;
                currentIndex = 0;
                interpolationFactor = 0;
                currentAngleRpm.value = -135;
                currentAngleSpeed.value = -135;
            }
        });

        onMounted(() => {
            caricaNote();
            animationFrameId = requestAnimationFrame(loopTelemetriaHardware);
        });

        onUnmounted(() => { if (animationFrameId) cancelAnimationFrame(animationFrameId); });

        const toggleMenu = () => { isMenuOpen.value = !isMenuOpen.value; };
        const changeView = (view) => { currentView.value = view; isMenuOpen.value = false; };

        return {
            currentView, isMenuOpen, simulatori, note, formNota, isEditing, liveTelemetry, isBooting,
            currentAngleRpm, currentAngleSpeed, toggleMenu, changeView, salvaNota, eliminaNota, avviaModifica, annullaModifica
        }
    }
};

Vue.createApp(appLogic).mount('#app');
