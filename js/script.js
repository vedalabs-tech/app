// ================================================================================
// CODE VED - MAIN APPLICATION LOGIC (script.js)
// Engineered by Divy Patel | Modular Architecture
// ================================================================================

(function() {
    'use strict';

    // ----------------------------------------------------------------------------
    // 1. CONFIGURATION & GLOBAL STATE
    // ----------------------------------------------------------------------------
    const Config = {
        GAS_URL: "https://script.google.com/macros/s/AKfycbzNO3inVc33ImhfLyde-JjjK9ZlPckLBksqCnCzelfhcklX6mp8KW8vfPTW4oWJTCcN/exec",
        API_ENDPOINT: "/api/chat",
        LOGO: "logo.png"
    };

    const State = {
        user: localStorage.getItem('codeved_user') || null,
        name: localStorage.getItem('codeved_name') || null,
        guestCount: (() => { 
            const v = parseInt(localStorage.getItem('codeved_guest') || '0', 10); 
            return isNaN(v) ? 0 : v; 
        })(),
        attachment: null,
        isProcessing: false,
        history: [],
        currentThreadId: null,
        currentTitle: null,
        abortController: null,
        location: null,
        weatherContext: null,
        thinkingMode: false,
        thinkingEffort: "medium",
        searchEnabled: false,
        lastUserMessage: null
    };

    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // ----------------------------------------------------------------------------
    // 2. UTILITIES & CUSTOM CONFIRM
    // ----------------------------------------------------------------------------
    function customConfirm(message) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('customConfirmOverlay');
            const msgEl = document.getElementById('customConfirmMsg');
            const cancelBtn = document.getElementById('customConfirmCancel');
            const okBtn = document.getElementById('customConfirmOk');
            
            msgEl.textContent = message;
            overlay.style.display = 'flex';
            
            function cleanup() { 
                overlay.style.display = 'none'; 
                cancelBtn.removeEventListener('click', onCancel); 
                okBtn.removeEventListener('click', onOk); 
            }
            
            function onCancel() { cleanup(); resolve(false); }
            function onOk() { cleanup(); resolve(true); }
            
            cancelBtn.addEventListener('click', onCancel);
            okBtn.addEventListener('click', onOk);
        });
    }

    // ----------------------------------------------------------------------------
    // 3. UI MANAGER
    // ----------------------------------------------------------------------------
    const UI = {
        autoScroll: true,
        
        toggleSidebar() {
            const sb = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            sb.classList.toggle('collapsed');
            overlay.classList.toggle('active', !sb.classList.contains('collapsed') && window.innerWidth <= 900);
        },
        
        toggleAttachMenu() { 
            document.getElementById('attachMenu').classList.toggle('active'); 
            document.getElementById('thinkMenu').classList.remove('active'); 
            document.getElementById('voiceMenu').classList.remove('active'); 
        },
        
        autoGrow(el) { 
            el.style.height = 'auto'; 
            el.style.height = Math.min(el.scrollHeight, 180) + 'px'; 
        },
        
        scrollToBottom(force = false) { 
            const c = document.getElementById('chatContainer'); 
            if (force || this.autoScroll) { 
                c.scrollTop = c.scrollHeight; 
            } 
        },
        
        escape(s) { 
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
        },
        
        showAuthMsg(msg, isError = true) {
            const el = document.getElementById('authMsg'); 
            el.innerText = msg; 
            el.style.color = isError ? 'var(--brand-danger)' : 'var(--brand-success)';
            setTimeout(() => el.innerText = '', 4000);
        },
        
        updateUserInfo(name, email) {
            if (name) { 
                State.name = name; 
                localStorage.setItem('codeved_name', name); 
            }
            const dispName = State.name || email.split('@')[0];
            document.getElementById('uAv').innerText = dispName.charAt(0).toUpperCase();
            document.getElementById('uName').innerText = dispName;
            document.getElementById('uSub').innerText = email;
            document.getElementById('btnLogout').style.display = 'flex';
            document.getElementById('btnDeleteAcc').style.display = 'flex';
            document.getElementById('btnLoginRegister').style.display = 'none';
            document.getElementById('welcomeTitle').innerHTML = `Hello, ${dispName}!<br>How can I help you today?`;
        },
        
        updateWelcomeScreen() { 
            document.getElementById('welcomeScreen').style.display = State.history.length === 0 ? 'flex' : 'none'; 
        },

        initListeners() {
            // Sidebar & Overlays
            document.getElementById('btnMenuOpen').addEventListener('click', () => this.toggleSidebar());
            document.getElementById('btnCloseSidebar').addEventListener('click', () => this.toggleSidebar());
            document.getElementById('mobileOverlay').addEventListener('click', () => this.toggleSidebar());
            
            // Scroll to bottom
            document.getElementById('scrollToBottomBtn').addEventListener('click', () => {
                this.scrollToBottom(true); 
                this.autoScroll = true;
            });

            // Input Dock Expanding Logic
            const inp = document.getElementById('mainInput');
            const dockWrapper = document.getElementById('dockWrapper');

            inp.addEventListener('focus', () => dockWrapper.classList.add('expanded'));
            inp.addEventListener('blur', () => {
                if (inp.value.trim() === '') dockWrapper.classList.remove('expanded');
            });
            inp.addEventListener('input', () => { 
                this.autoGrow(inp); 
                if (inp.value.trim() !== '') dockWrapper.classList.add('expanded');
            });
            inp.addEventListener('keydown', (e) => { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    Chat.handleSend(); 
                } 
            });

            // Chat Container Scroll Listener
            const chatContainerEl = document.getElementById('chatContainer');
            const scrollBtnEl = document.getElementById('scrollToBottomBtn');
            
            chatContainerEl.addEventListener('scroll', () => {
                const scrollBottom = chatContainerEl.scrollHeight - chatContainerEl.scrollTop - chatContainerEl.clientHeight;
                this.autoScroll = scrollBottom <= 50;
                scrollBtnEl.classList.toggle('visible', !this.autoScroll);
            });

            // Close dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.tools-left')) {
                    document.getElementById('attachMenu').classList.remove('active'); 
                    document.getElementById('thinkMenu').classList.remove('active'); 
                    document.getElementById('voiceMenu').classList.remove('active');
                }
            });
        }
    };

    // ----------------------------------------------------------------------------
    // 4. AUTH MANAGER
    // ----------------------------------------------------------------------------
    const Auth = {
        init() {
            if (State.user) { 
                UI.updateUserInfo(State.name, State.user); 
                HistoryManager.syncAllChats(); 
            } else {
                document.getElementById('uAv').innerText = "G"; 
                document.getElementById('uName').innerText = "Guest Mode"; 
                document.getElementById('uSub').innerText = `Queries: ${State.guestCount}/10`;
                document.getElementById('btnLogout').style.display = 'none'; 
                document.getElementById('btnDeleteAcc').style.display = 'none'; 
                document.getElementById('btnLoginRegister').style.display = 'inline-flex';
                document.getElementById('welcomeTitle').innerHTML = `Hello, Guest!<br>How can I help you today?`;
            }
        },
        
        async handleLogout() { 
            const ok = await customConfirm("Are you sure you want to logout?"); 
            if (ok) { 
                localStorage.removeItem('codeved_user'); 
                localStorage.removeItem('codeved_name'); 
                location.reload(); 
            } 
        },
        
        async handleDeleteAccount() { 
            const ok = await customConfirm("Are you sure you want to permanently delete your account and all data?"); 
            if (ok) { 
                try {
                    await fetch(Config.GAS_URL, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ action: "delete_account", email: State.user }) 
                    });
                } catch(e) { console.error("Account delete error:", e); } 
                finally {
                    localStorage.removeItem('codeved_user'); 
                    localStorage.removeItem('codeved_name'); 
                    location.reload(); 
                }
            } 
        },
        
        openModal() { document.getElementById('authModal').style.display = 'flex'; },
        closeModal() { document.getElementById('authModal').style.display = 'none'; },
        
        switchTab(tab) {
            document.getElementById('tabLogin').classList.remove('active'); 
            document.getElementById('tabRegister').classList.remove('active');
            document.getElementById('flowLogin').style.display = 'none'; 
            document.getElementById('flowRegister').style.display = 'none';
            
            if (tab === 'login') { 
                document.getElementById('tabLogin').classList.add('active'); 
                document.getElementById('flowLogin').style.display = 'block'; 
            } else { 
                document.getElementById('tabRegister').classList.add('active'); 
                document.getElementById('flowRegister').style.display = 'block'; 
            }
        },
        
        switchPhase(from, to) { 
            document.getElementById(from).classList.remove('active'); 
            document.getElementById(to).classList.add('active'); 
        },
        
        async process(action) {
            let payload = { action: action }; 
            let btnId = '';
            
            if (action === 'register_send_otp') {
                payload.name = document.getElementById('regName').value.trim(); 
                payload.email = document.getElementById('regEmail').value.trim();
                payload.phone = "0000000000"; 
                payload.organization = "CODE VED";
                if (!payload.name || !payload.email) return UI.showAuthMsg("Details missing."); 
                btnId = 'btnRegOtp';
            } else if (action === 'login_send_otp') {
                payload.email = document.getElementById('logEmail').value.trim();
                if (!payload.email) return UI.showAuthMsg("Email required."); 
                btnId = 'btnLogOtp';
            } else if (action === 'register_verify' || action === 'login_verify') {
                payload.email = document.getElementById(action === 'register_verify' ? 'regEmail' : 'logEmail').value.trim();
                payload.otp = document.getElementById(action === 'register_verify' ? 'regOtp' : 'logOtp').value.trim();
                if (!payload.otp) return UI.showAuthMsg("OTP required."); 
                btnId = action === 'register_verify' ? 'btnRegVerify' : 'btnLogVerify';
            }
            
            const btn = document.getElementById(btnId); 
            const originalText = btn.innerText;
            btn.disabled = true; 
            btn.innerText = "Wait...";
            
            try {
                const res = await fetch(Config.GAS_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload) 
                });
                
                const textResponse = await res.text();
                let data;
                try { data = JSON.parse(textResponse); } 
                catch (parseErr) {
                    UI.showAuthMsg("Invalid response from server. Network error.");
                    btn.disabled = false; btn.innerText = originalText; return;
                }
                
                if (data.status === 'success') {
                    UI.showAuthMsg(data.message, false);
                    if (action === 'register_send_otp') Auth.switchPhase('regPhase1', 'regPhase2');
                    else if (action === 'login_send_otp') Auth.switchPhase('loginPhase1', 'loginPhase2');
                    else { 
                        localStorage.setItem('codeved_user', payload.email); 
                        if (data.user && data.user.name) localStorage.setItem('codeved_name', data.user.name); 
                        location.reload(); 
                    }
                } else {
                    UI.showAuthMsg(data.message);
                }
            } catch (e) { 
                UI.showAuthMsg("Network Error. Please try again."); 
            }
            
            btn.disabled = false; 
            btn.innerText = originalText;
        },

        initListeners() {
            document.getElementById('btnLoginRegister').addEventListener('click', () => this.openModal());
            document.getElementById('btnLogout').addEventListener('click', () => this.handleLogout());
            document.getElementById('btnDeleteAcc').addEventListener('click', () => this.handleDeleteAccount());
            document.getElementById('btnAuthClose').addEventListener('click', () => this.closeModal());
            
            document.getElementById('authModal').addEventListener('click', (e) => {
                if (e.target.id === 'authModal') this.closeModal();
            });

            document.getElementById('tabLogin').addEventListener('click', () => this.switchTab('login'));
            document.getElementById('tabRegister').addEventListener('click', () => this.switchTab('register'));

            document.getElementById('btnLogOtp').addEventListener('click', () => this.process('login_send_otp'));
            document.getElementById('btnLogVerify').addEventListener('click', () => this.process('login_verify'));
            document.getElementById('btnRegOtp').addEventListener('click', () => this.process('register_send_otp'));
            document.getElementById('btnRegVerify').addEventListener('click', () => this.process('register_verify'));
        }
    };

    // ----------------------------------------------------------------------------
    // 5. HISTORY MANAGER
    // ----------------------------------------------------------------------------
    const HistoryManager = {
        async syncAllChats() {
            if (!State.user) return;
            try { 
                const res = await fetch(Config.GAS_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: "get_all_chats", email: State.user }) 
                });
                const data = JSON.parse(await res.text());
                if (data.status === 'success') { 
                    if (data.user) UI.updateUserInfo(data.user.name, data.user.email); 
                    this.renderSidebar(data.chats || []); 
                }
            } catch (e) { console.error("History sync error:", e); }
        },
        
        renderSidebar(chats) {
            const container = document.getElementById('chatHistory'); 
            container.innerHTML = `<div class="history-header"><span class="history-title-text">Recent Workspaces</span><span class="btn-clear-all" id="btnClearAll">Clear All</span></div>`;
            
            document.getElementById('btnClearAll').addEventListener('click', () => this.clearAll());

            chats.forEach(chat => {
                const isActive = State.currentThreadId === chat.threadId ? 'active' : '';
                const item = document.createElement('div');
                item.className = `history-item ${isActive}`;
                item.dataset.threadId = chat.threadId;
                item.innerHTML = `
                    <span class="history-text">${UI.escape(chat.title)}</span>
                    <button class="btn-delete-chat" data-delete-id="${chat.threadId}" title="Delete">
                        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>`;
                container.appendChild(item);
            });
        },
        
        async loadChat(threadId) {
            if (!State.user || State.isProcessing) return;
            State.currentThreadId = threadId; 
            document.getElementById('chatMessages').innerHTML = '';
            
            try {
                const res = await fetch(Config.GAS_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: "get_chat", email: State.user, threadId: threadId }) 
                });
                const data = JSON.parse(await res.text());
                
                if (data.status === 'success') {
                    State.history = JSON.parse(data.historyJSON || "[]"); 
                    UI.updateWelcomeScreen();
                    
                    for (const msg of State.history) {
                        if (msg.role === 'user') {
                            let dispText = msg.content;
                            if (dispText.includes('[SYSTEM REAL-TIME WEATHER:')) dispText = dispText.split('\n\n[SYSTEM REAL-TIME WEATHER:')[0];
                            if (dispText.includes('---END DATA---')) {
                                const afterMarker = dispText.split('---END DATA---')[1] || '';
                                dispText = afterMarker.replace(/^\s*User:\s*/, '').trim() || '[Attached File]';
                            }
                            Chat.renderUser(dispText);
                        } else {
                            const msgId = 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                            const botObj = Chat.renderBot(msgId);
                            Chat.parseAndRender(msg.content, false, botObj.contentDiv);
                            TTSManager.autoPrepare(msgId, msg.content, botObj.listenBtn);
                        }
                    }
                    UI.autoScroll = true; 
                    UI.scrollToBottom();
                    if (window.innerWidth <= 900) UI.toggleSidebar();
                }
            } catch (e) { console.error("Load chat error:", e); }
        },
        
        startNew() {
            if (State.isProcessing) return; 
            State.currentThreadId = null; 
            State.currentTitle = null; 
            State.history = [];
            document.getElementById('chatMessages').innerHTML = ''; 
            UI.updateWelcomeScreen(); 
            UI.autoScroll = true; 
            UI.scrollToBottom();
            if (window.innerWidth <= 900) UI.toggleSidebar();
        },
        
        saveCurrent() {
            if (!State.user || State.history.length === 0) return;
            if (!State.currentThreadId) { 
                State.currentThreadId = "thr_" + Date.now(); 
                const firstUser = State.history.find(m => m.role === 'user'); 
                State.currentTitle = firstUser ? firstUser.content.substring(0, 25) : "New Workspace"; 
            }
            
            fetch(Config.GAS_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ 
                    action: "save_chat", 
                    email: State.user, 
                    threadId: State.currentThreadId, 
                    title: State.currentTitle, 
                    historyJSON: JSON.stringify(State.history) 
                }) 
            }).catch(e => console.error("Save error:", e)).then(() => this.syncAllChats());
        },
        
        async clearAll() { 
            const ok = await customConfirm("Clear all workspaces?"); 
            if (ok) { 
                State.history = []; 
                State.currentThreadId = null; 
                State.currentTitle = null; 
                document.getElementById('chatMessages').innerHTML = ''; 
                UI.updateWelcomeScreen(); 
                UI.autoScroll = true; 
                UI.scrollToBottom(); 
                
                fetch(Config.GAS_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: "clear_all_chats", email: State.user }) 
                }).catch(e => console.error("Clear error:", e)).then(() => this.syncAllChats()); 
            } 
        },
        
        async deleteChat(threadId) { 
            const ok = await customConfirm("Delete this workspace?"); 
            if (ok) { 
                if (State.currentThreadId === threadId) this.startNew(); 
                fetch(Config.GAS_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: "delete_chat", email: State.user, threadId: threadId }) 
                }).catch(e => console.error("Delete error:", e)).then(() => this.syncAllChats()); 
            } 
        },

        initListeners() {
            document.getElementById('btnNewChat').addEventListener('click', () => this.startNew());
            
            // Event Delegation for History List
            document.getElementById('chatHistory').addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.btn-delete-chat');
                if (deleteBtn) {
                    e.stopPropagation();
                    this.deleteChat(deleteBtn.dataset.deleteId);
                    return;
                }
                
                const historyItem = e.target.closest('.history-item');
                if (historyItem && historyItem.dataset.threadId) {
                    this.loadChat(historyItem.dataset.threadId);
                }
            });
        }
    };

    // ----------------------------------------------------------------------------
    // 6. ENVIRONMENT, SEARCH & THINKING MANAGERS
    // ----------------------------------------------------------------------------
    const EnvironmentManager = {
        toggle() {
            const status = document.getElementById('locStatus'); 
            document.getElementById('attachMenu').classList.remove('active');
            
            if (State.location) { 
                State.location = null; 
                State.weatherContext = null; 
                status.style.display = 'none'; 
            } else {
                if (navigator.geolocation) {
                    status.style.display = 'flex'; 
                    status.innerHTML = `<span>Finding location...</span>`;
                    
                    navigator.geolocation.getCurrentPosition(pos => {
                        State.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        status.innerHTML = `<span style="color:var(--brand-success);">✓ Location active!</span>`; 
                        setTimeout(() => status.style.display = 'none', 3000);
                        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => {
                                const c = data && data.current;
                                if (c) State.weatherContext = `Temperature: ${c.temperature_2m}°C, Humidity: ${c.relative_humidity_2m}%, Wind: ${c.wind_speed_10m} km/h`;
                            }).catch(() => {});
                    }, err => { 
                        status.innerHTML = `<span style="color:var(--brand-danger);">Location denied.</span>`; 
                        setTimeout(() => status.style.display = 'none', 3000); 
                    });
                }
            }
        }
    };

    const SearchManager = {
        toggle() { 
            State.searchEnabled = !State.searchEnabled; 
            const btn = document.getElementById('btnSearch'); 
            btn.classList.toggle('active-search', State.searchEnabled); 
            btn.title = State.searchEnabled ? 'Web Search: ON' : 'Web Search: OFF'; 
        }
    };

    const ThinkingManager = {
        toggleMenu() { 
            document.getElementById('thinkMenu').classList.toggle('active'); 
            document.getElementById('attachMenu').classList.remove('active'); 
        },
        
        setEffort(level) { 
            State.thinkingMode = true; 
            State.thinkingEffort = level; 
            document.getElementById('thinkMenu').classList.remove('active'); 
            this.updateIndicator(); 
        },
        
        disable() { 
            State.thinkingMode = false; 
            document.getElementById('thinkMenu').classList.remove('active'); 
            this.updateIndicator(); 
        },
        
        updateIndicator() { 
            const btn = document.getElementById('btnAttach'); 
            btn.classList.remove('active-think-low', 'active-think-medium', 'active-think-high'); 
            if (State.thinkingMode) {
                btn.classList.add(`active-think-${State.thinkingEffort}`); 
                btn.title = `Thinking Mode: ${State.thinkingEffort.charAt(0).toUpperCase() + State.thinkingEffort.slice(1)}`;
            } else {
                btn.title = 'Attach File';
            }
        },

        initListeners() {
            document.getElementById('thinkMenu').addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (!item) return;
                
                if (item.id === 'optDisableThink') {
                    this.disable();
                } else if (item.dataset.effort) {
                    this.setEffort(item.dataset.effort);
                }
            });
        }
    };

    // ----------------------------------------------------------------------------
    // 7. FILE SYSTEM & SPEECH
    // ----------------------------------------------------------------------------
    const FileSys = {
        async process(input, type) {
            document.getElementById('attachMenu').classList.remove('active'); 
            const file = input.files[0]; 
            if (!file) return;
            
            document.getElementById('filePreviewBar').classList.add('active'); 
            document.getElementById('fileName').innerText = file.name;
            
            if (type === 'image') {
                document.getElementById('imgPreview').style.display = 'block'; 
                document.getElementById('docPreview').style.display = 'none';
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image(); 
                    img.onload = () => {
                        const canvas = document.createElement('canvas'); 
                        const ctx = canvas.getContext('2d');
                        let w = img.width, h = img.height; 
                        const max = 1024;
                        
                        if(w > max || h > max) { 
                            if(w > h) { h = (max/w)*h; w = max; } 
                            else { w = (max/h)*w; h = max; } 
                        }
                        
                        canvas.width = w; canvas.height = h; 
                        ctx.drawImage(img, 0, 0, w, h);
                        
                        const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                        State.attachment = { type: 'image', data: b64, name: file.name }; 
                        document.getElementById('imgPreview').src = `data:image/jpeg;base64,${b64}`;
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                document.getElementById('imgPreview').style.display = 'none'; 
                document.getElementById('docPreview').style.display = 'block';
                
                if (file.name.endsWith('.pdf')) {
                    try { 
                        const arrayBuffer = await file.arrayBuffer(); 
                        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise; 
                        let text = ''; 
                        for (let i = 1; i <= pdf.numPages; i++) { 
                            const page = await pdf.getPage(i); 
                            const content = await page.getTextContent(); 
                            text += content.items.map(item => item.str).join(' ') + '\n'; 
                        } 
                        State.attachment = { type: 'text', data: text, name: file.name }; 
                    } catch(e) { State.attachment = { type: 'text', data: '[PDF parsing error]', name: file.name }; }
                } else if (file.name.endsWith('.docx')) {
                    try { 
                        const arrayBuffer = await file.arrayBuffer(); 
                        const result = await mammoth.extractRawText({ arrayBuffer }); 
                        State.attachment = { type: 'text', data: result.value, name: file.name }; 
                    } catch(e) { State.attachment = { type: 'text', data: '[DOCX parsing error]', name: file.name }; }
                } else { 
                    const reader = new FileReader(); 
                    reader.onload = (e) => { State.attachment = { type: 'text', data: e.target.result, name: file.name }; }; 
                    reader.readAsText(file); 
                }
            }
            input.value = '';
            document.getElementById('dockWrapper').classList.add('expanded');
        },
        
        discard() { 
            State.attachment = null; 
            document.getElementById('filePreviewBar').classList.remove('active'); 
            if (document.getElementById('mainInput').value.trim() === '') {
                document.getElementById('dockWrapper').classList.remove('expanded');
            }
        },

        initListeners() {
            document.getElementById('btnRemoveFile').addEventListener('click', () => this.discard());
            document.getElementById('imgUpload').addEventListener('change', (e) => this.process(e.target, 'image'));
            document.getElementById('docUpload').addEventListener('change', (e) => this.process(e.target, 'document'));
        }
    };

    const Speech = {
        rec: null, 
        isRec: false,
        
        init() {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition; 
            if (!SR) return;
            
            this.rec = new SR(); 
            this.rec.continuous = false; 
            this.rec.interimResults = true; 
            this.rec.lang = navigator.language || 'en-US';
            
            this.rec.onstart = () => { 
                this.isRec = true; 
                document.getElementById('btnStt').classList.add('recording'); 
            };
            
            this.rec.onresult = (e) => {
                if (!e.results || !e.results.length) return;
                let trans = ''; 
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal && e.results[i][0]) trans += e.results[i][0].transcript;
                }
                if (trans) { 
                    const input = document.getElementById('mainInput'); 
                    input.value += (input.value ? ' ' : '') + trans; 
                    UI.autoGrow(input); 
                    document.getElementById('dockWrapper').classList.add('expanded');
                }
            };
            
            this.rec.onerror = () => this.stop(); 
            this.rec.onend = () => this.stop();
        },
        
        toggle() { 
            if (!this.rec) this.init(); 
            if (this.isRec) this.stop(); 
            else { try { this.rec.start(); } catch(e) {} } 
        },
        
        stop() { 
            if(this.rec) this.rec.stop(); 
            this.isRec = false; 
            document.getElementById('btnStt').classList.remove('recording'); 
        },

        initListeners() {
            document.getElementById('btnStt').addEventListener('click', () => this.toggle());
        }
    };

    // ----------------------------------------------------------------------------
    // 8. TTS MANAGER
    // ----------------------------------------------------------------------------
    const TTSManager = {
        cache: {}, 
        currentAudio: null, 
        selectedVoice: "M2", 
        selectedLanguage: "English", 
        isPlaying: false, 
        currentMsgId: null, 
        currentBtnElement: null, 
        preparingSet: new Set(),
        
        voiceMap: { 
            "M1": "Aarav", "M2": "Kabir", "M3": "Vihaan", "M4": "Advik", "M5": "Rohan", 
            "F1": "Priya", "F2": "Ananya", "F3": "Diya", "F4": "Sneha", "F5": "Kavya" 
        },
        
        languageMap: { 
            "English": "en", "Korean": "ko", "Japanese": "ja", "Arabic": "ar", "Bulgarian": "bg", 
            "Czech": "cs", "Danish": "da", "German": "de", "Greek": "el", "Spanish": "es", 
            "Estonian": "et", "Finnish": "fi", "French": "fr", "Hindi": "hi", "Croatian": "hr", 
            "Hungarian": "hu", "Indonesian": "id", "Italian": "it", "Lithuanian": "lt", "Latvian": "lv", 
            "Dutch": "nl", "Polish": "pl", "Portuguese": "pt", "Romanian": "ro", "Russian": "ru", 
            "Slovak": "sk", "Slovenian": "sl", "Swedish": "sv", "Turkish": "tr", "Ukrainian": "uk", 
            "Vietnamese": "vi" 
        },
        
        initUI() {
            const list = document.getElementById('voiceOptionsList'); 
            list.innerHTML = '';
            
            for (const [code, name] of Object.entries(this.voiceMap)) {
                const isSelected = code === this.selectedVoice;
                const checkIcon = isSelected ? `<svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>` : `<div></div>`;
                const item = document.createElement('div');
                item.className = `dropdown-item ${isSelected ? 'selected' : ''}`;
                item.dataset.voiceCode = code;
                item.innerHTML = `<span>${name}</span>${checkIcon}`;
                list.appendChild(item);
            }
            
            const langList = document.getElementById('languageOptionsList'); 
            langList.innerHTML = '';
            
            for (const [name, code] of Object.entries(this.languageMap)) {
                const isSelected = name === this.selectedLanguage;
                const checkIcon = isSelected ? `<svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>` : `<div></div>`;
                const item = document.createElement('div');
                item.className = `dropdown-item ${isSelected ? 'selected' : ''}`;
                item.dataset.langName = name;
                item.innerHTML = `<span>${name}</span>${checkIcon}`;
                langList.appendChild(item);
            }
        },
        
        setVoice(code) { 
            Object.values(this.cache).forEach(url => URL.revokeObjectURL(url)); 
            this.cache = {}; 
            this.selectedVoice = code; 
            this.initUI(); 
            document.getElementById('voiceMenu').classList.remove('active'); 
        },
        
        setLanguage(name) { 
            Object.values(this.cache).forEach(url => URL.revokeObjectURL(url)); 
            this.cache = {}; 
            this.selectedLanguage = name; 
            this.initUI(); 
            document.getElementById('voiceMenu').classList.remove('active'); 
        },
        
        cleanTextForTTS(text) {
            let cleaned = text.replace(/\u0060{3}[\s\S]*?\u0060{3}/g, '')
                              .replace(/\u0060[^\u0060]*\u0060/g, '')
                              .replace(/<think>[\s\S]*?<\/think>/gi, '')
                              .replace(/https?:\/\/[^\s]+/g, '')
                              .replace(/[*_#\u0060~>]/g, '')
                              .replace(/<[^>]*>/g, '')
                              .replace(/\s+/g, ' ')
                              .trim();
                              
            cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '')
                             .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
                             .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
                             .replace(/[\u{2600}-\u{26FF}]/gu, '')
                             .replace(/[\u{2700}-\u{27BF}]/gu, '');
                             
            if (cleaned.length > 1500) cleaned = cleaned.substring(0, 1500) + '...'; 
            return cleaned;
        },
        
        async autoPrepare(msgId, fullText, btnElement) {
            if (this.preparingSet.has(msgId)) return;
            
            const cleanText = this.cleanTextForTTS(fullText); 
            if (!cleanText) { btnElement.style.display = 'none'; return; }
            
            this.preparingSet.add(msgId);
            btnElement.style.display = 'flex'; 
            btnElement.innerHTML = `<svg class="spin-icon" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Preparing...`;
            btnElement.style.pointerEvents = 'none';
            
            try {
                const response = await fetch('/api/tts', { 
                    method: 'POST', 
                    headers: {'Content-Type':'application/json'}, 
                    body: JSON.stringify({ text: cleanText, voice: this.selectedVoice, language_name: this.selectedLanguage }) 
                });
                
                if (!response.ok) throw new Error('TTS service unavailable');
                
                const blob = await response.blob(); 
                this.cache[msgId] = URL.createObjectURL(blob);
                
                btnElement.innerHTML = `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Listen`;
                btnElement.style.pointerEvents = 'auto';
            } catch(e) { 
                btnElement.innerHTML = `<span style="color:var(--brand-danger);">⚠️ ${e.message}</span>`; 
                setTimeout(() => { btnElement.style.display = 'none'; }, 4000); 
            } finally { this.preparingSet.delete(msgId); }
        },
        
        play(msgId, btnElement) {
            const audioUrl = this.cache[msgId];
            if (!audioUrl) { 
                this.autoPrepare(msgId, document.getElementById(`bot-content-${msgId}`).innerText, btnElement); 
                return; 
            }
            
            if (this.isPlaying && this.currentMsgId === msgId) {
                if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio.currentTime = 0; }
                this.isPlaying = false; 
                this.currentMsgId = null;
                btnElement.innerHTML = `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Listen`;
                btnElement.style.background = ''; 
                return;
            }
            
            if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio.currentTime = 0; }
            
            this.isPlaying = true; 
            this.currentMsgId = msgId; 
            this.currentBtnElement = btnElement;
            
            const originalHTML = btnElement.innerHTML;
            btnElement.innerHTML = `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Playing...`;
            btnElement.style.background = 'rgba(211, 227, 253, 0.9)';
            
            this.currentAudio = new Audio(audioUrl); 
            this.currentAudio.playbackRate = 1.15;
            
            const resetBtn = () => {
                this.isPlaying = false; 
                this.currentMsgId = null; 
                btnElement.innerHTML = originalHTML; 
                btnElement.style.background = '';
            };
            
            this.currentAudio.onended = resetBtn;
            this.currentAudio.onerror = resetBtn;
            
            this.currentAudio.play();
        },

        initListeners() {
            document.getElementById('voiceMenu').addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (!item) return;
                
                if (item.dataset.voiceCode) this.setVoice(item.dataset.voiceCode);
                else if (item.dataset.langName) this.setLanguage(item.dataset.langName);
            });
        }
    };

    // ----------------------------------------------------------------------------
    // 9. CHAT MANAGER
    // ----------------------------------------------------------------------------
    const Chat = {
        renderUser(txt, attachUI = '') {
            const c = document.getElementById('chatMessages'); 
            const w = document.createElement('div'); 
            w.className = 'message-wrapper';
            w.innerHTML = `<div class="user-message">${attachUI}${txt ? UI.escape(txt) : ''}</div>`;
            c.appendChild(w); 
            UI.autoScroll = true; 
            UI.scrollToBottom(true);
        },
        
        renderBot(msgId) {
            const c = document.getElementById('chatMessages'); 
            const w = document.createElement('div'); 
            w.className = 'message-wrapper';
            const listenIcon = `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
            const copyIcon = `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            
            w.innerHTML = `
            <div class="bot-message">
                <div class="bot-avatar"><img src="${Config.LOGO}"></div>
                <div class="bot-content-wrapper">
                    <div class="bot-content" id="bot-content-${msgId}"></div>
                    <div class="msg-actions">
                        <button class="action-btn listen-btn" id="listen-btn-${msgId}" style="display:none;">${listenIcon} Listen</button>
                        <button class="action-btn copy-btn">${copyIcon} Copy</button>
                    </div>
                </div>
            </div>`;
            
            c.appendChild(w); 
            UI.scrollToBottom();
            
            return { 
                contentDiv: document.getElementById(`bot-content-${msgId}`), 
                listenBtn: document.getElementById(`listen-btn-${msgId}`),
                wrapper: w,
                msgId: msgId
            };
        },
        
        // Delegating Markdown Rendering to the dedicated module
        parseAndRender(fullText, isProcessing, container) {
            if (window.MarkdownRenderer && typeof window.MarkdownRenderer.parseAndRender === 'function') {
                window.MarkdownRenderer.parseAndRender(fullText, isProcessing, container);
            } else {
                // Fallback if markdownRenderer.js hasn't loaded yet
                container.innerHTML = fullText; 
            }
        },
        
        copyMsg(contentDiv) {
            const clone = contentDiv.cloneNode(true);
            const thinkBox = clone.querySelector('.qwen-think-box');
            if (thinkBox) thinkBox.remove();
            
            navigator.clipboard.writeText(clone.innerText).then(() => {
                const btn = contentDiv.parentElement.querySelector('.copy-btn');
                const original = btn.innerHTML;
                btn.innerHTML = `<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
                setTimeout(() => btn.innerHTML = original, 1500);
            });
        },
        
        stopGeneration() {
            if (State.abortController) { 
                State.abortController.abort(); 
                State.abortController = null; 
            }
            State.isProcessing = false; 
            document.getElementById('btnSend').disabled = false; 
            document.getElementById('btnSend').style.display = 'flex'; 
            document.getElementById('btnStop').classList.remove('active');
            if (document.getElementById('mainInput').value.trim() === '') {
                document.getElementById('dockWrapper').classList.remove('expanded');
            }
        },
        
        async handleSend() {
            if(State.isProcessing) return;
            
            if (!State.user && State.guestCount >= 10) { 
                Auth.openModal(); 
                UI.showAuthMsg("Guest limit reached (10/10). Please login or register to continue.", true); 
                return; 
            }
            
            const input = document.getElementById('mainInput'); 
            const text = input.value.trim();
            
            if(!text && !State.attachment) return;
            
            if (!State.user) {
                let count = parseInt(localStorage.getItem('codeved_guest') || '0', 10); 
                if (isNaN(count)) count = 0;
                count++; 
                State.guestCount = count; 
                localStorage.setItem('codeved_guest', count.toString()); 
                document.getElementById('uSub').innerText = `Queries: ${count}/10`;
            }
            
            State.isProcessing = true; 
            document.getElementById('btnSend').style.display = 'none'; 
            document.getElementById('btnStop').classList.add('active');
            State.lastUserMessage = text; 
            input.value = ''; 
            input.style.height = 'auto'; 
            UI.updateWelcomeScreen();
            
            let payloadStr = text, attachUI = '', mediaArray = [];
            
            if(State.attachment) {
                if(State.attachment.type === 'text') {
                    payloadStr = `[File attached: ${State.attachment.name}]\n\n---DATA---\n${State.attachment.data}\n---END DATA---\n\nUser: ${text}`;
                    attachUI = `<div class="chat-attachment-container"><div class="chat-file-pill"><svg style="width:14px;height:14px;color:var(--text-secondary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg> ${State.attachment.name}</div></div>`;
                } else {
                    mediaArray.push(State.attachment); 
                    attachUI = `<div class="chat-attachment-container"><img src="data:image/jpeg;base64,${State.attachment.data}" class="chat-img-preview"></div>`;
                }
            }
            
            let systemInjectedPayload = payloadStr;
            if(State.weatherContext) {
                systemInjectedPayload = `${payloadStr}\n\n[SYSTEM REAL-TIME WEATHER: ${State.weatherContext}]`;
            }
            
            Chat.renderUser(text, attachUI);
            State.history.push({ role: 'user', content: payloadStr }); 
            FileSys.discard();
            
            const msgId = Date.now().toString(); 
            const botObj = Chat.renderBot(msgId);
            Chat.parseAndRender("", true, botObj.contentDiv);
            
            State.abortController = new AbortController();
            let fullText = "";
            
            try {
                const res = await fetch(Config.API_ENDPOINT, {
                    method: 'POST', 
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ 
                        message: systemInjectedPayload, 
                        attachments: mediaArray, 
                        is_search: State.searchEnabled, 
                        location: State.location, 
                        thinking_mode: State.thinkingMode, 
                        thinking_effort: State.thinkingEffort, 
                        history: State.history 
                    }),
                    signal: State.abortController.signal
                });
                
                if(!res.ok) {
                    let errMsg = `Server error (${res.status})`;
                    if (res.status === 404) errMsg = 'Chat API endpoint not found (404).';
                    else if (res.status === 500) errMsg = 'Internal server error (500).';
                    throw new Error(errMsg);
                }
                
                const reader = res.body.getReader(); 
                const decoder = new TextDecoder(); 
                let buffer = '';
                
                while(true) {
                    const {done, value} = await reader.read();
                    if(done) break;
                    
                    buffer += decoder.decode(value, {stream: true});
                    const lines = buffer.split('\n'); 
                    buffer = lines.pop();
                    
                    for(let line of lines) {
                        if(line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if(dataStr === '[DONE]') continue;
                            
                            try {
                                const json = JSON.parse(dataStr);
                                if (json.error) { 
                                    botObj.contentDiv.innerHTML += `<br><span style="color:var(--brand-danger);">⚠️ ${UI.escape(json.error)}</span>`; 
                                    return; 
                                }
                                if(json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
                                    fullText += json.choices[0].delta.content;
                                }
                            } catch(e) {}
                            
                            Chat.parseAndRender(fullText, true, botObj.contentDiv);
                        }
                    }
                }
                
                Chat.parseAndRender(fullText, false, botObj.contentDiv);
                State.history.push({ role: 'assistant', content: fullText });
                HistoryManager.saveCurrent();
                
            } catch(e) {
                if (e.name === 'AbortError') {
                    botObj.contentDiv.innerHTML += `<br><span style="color:var(--text-tertiary); font-style:italic;">⏹ Generation stopped.</span>`;
                    if (fullText.trim()) { 
                        State.history.push({ role: 'assistant', content: fullText }); 
                        HistoryManager.saveCurrent(); 
                    }
                } else {
                    botObj.contentDiv.innerHTML += `<br><span style="color:var(--brand-danger);">⚠️ ${UI.escape(e.message || 'Connection Offline.')}</span>`;
                }
            } finally {
                State.isProcessing = false; 
                document.getElementById('btnSend').disabled = false; 
                document.getElementById('btnSend').style.display = 'flex'; 
                document.getElementById('btnStop').classList.remove('active');
                
                if (document.getElementById('mainInput').value.trim() === '') {
                    document.getElementById('dockWrapper').classList.remove('expanded');
                }
                
                if (UI.autoScroll) UI.scrollToBottom();
                if(botObj.listenBtn && fullText.trim().length > 0) {
                    TTSManager.autoPrepare(msgId, fullText, botObj.listenBtn);
                }
            }
        },

        initListeners() {
            document.getElementById('btnSend').addEventListener('click', () => this.handleSend());
            document.getElementById('btnStop').addEventListener('click', () => this.stopGeneration());

            // Event Delegation for Chat Messages (Copy & Listen buttons)
            document.getElementById('chatMessages').addEventListener('click', (e) => {
                const listenBtn = e.target.closest('.listen-btn');
                if (listenBtn) {
                    const msgId = listenBtn.id.replace('listen-btn-', '');
                    TTSManager.play(msgId, listenBtn);
                    return;
                }

                const copyBtn = e.target.closest('.copy-btn');
                if (copyBtn) {
                    const contentDiv = copyBtn.closest('.bot-content-wrapper').querySelector('.bot-content');
                    this.copyMsg(contentDiv);
                    return;
                }
                
                // Code block copy delegation (handled by markdownRenderer usually, but safe fallback here)
                const codeCopyBtn = e.target.closest('.code-copy-btn');
                if (codeCopyBtn && !codeCopyBtn.classList.contains('copied')) {
                    const pre = codeCopyBtn.closest('pre');
                    const codeEl = pre.querySelector('code');
                    if(codeEl) {
                        navigator.clipboard.writeText(codeEl.innerText).then(() => {
                            codeCopyBtn.classList.add('copied');
                            codeCopyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Copied!</span>`;
                            setTimeout(() => {
                                codeCopyBtn.classList.remove('copied');
                                codeCopyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span>`;
                            }, 1500);
                        });
                    }
                }
            });
        }
    };

    // ----------------------------------------------------------------------------
    // 10. ATTACH MENU & INITIALIZATION
    // ----------------------------------------------------------------------------
    function initAttachMenuListeners() {
        document.getElementById('btnAttach').addEventListener('click', () => UI.toggleAttachMenu());
        document.getElementById('optUploadImg').addEventListener('click', () => document.getElementById('imgUpload').click());
        document.getElementById('optUploadDoc').addEventListener('click', () => document.getElementById('docUpload').click());
        document.getElementById('optEnv').addEventListener('click', () => EnvironmentManager.toggle());
        document.getElementById('optThink').addEventListener('click', () => ThinkingManager.toggleMenu());
        document.getElementById('optVoice').addEventListener('click', () => TTSManager.toggleMenu());
        
        document.getElementById('btnSearch').addEventListener('click', () => SearchManager.toggle());
    }

    function initGlobal() {
        // Set Logos
        document.getElementById('faviconLink').href = Config.LOGO;
        document.getElementById('welcomeLogoImg').src = Config.LOGO;
        document.getElementById('sidebarLogoImg').src = Config.LOGO;

        // Initialize all listeners
        UI.initListeners();
        Auth.initListeners();
        HistoryManager.initListeners();
        ThinkingManager.initListeners();
        FileSys.initListeners();
        Speech.initListeners();
        TTSManager.initListeners();
        Chat.initListeners();
        initAttachMenuListeners();

        // Initial State Setup
        Auth.init();
        TTSManager.initUI();
        UI.updateWelcomeScreen();
        
        if(window.innerWidth > 900) {
            document.getElementById('sidebar').classList.remove('collapsed'); 
        }
    }

    // Run when DOM is fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobal);
    } else {
        initGlobal();
    }

})();
