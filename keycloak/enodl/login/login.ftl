<#import "template.ftl" as layout>

<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=false; section>
    <#if section = "header">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>
            /* ========================================
               RESET AGRESIVO PARA KEYCLOAK
               ======================================== */
            
            /* Reset completo */
            *, *::before, *::after {
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            /* Variables */
            :root {
                --kc-primary: #10b981;
                --kc-primary-hover: #059669;
                --kc-bg: #0f0f0f;
                --kc-surface: #1c1c1c;
                --kc-border: #2a2a2a;
                --kc-text: #fafafa;
                --kc-text-muted: #a1a1a1;
                --kc-text-subtle: #6b6b6b;
                --kc-error: #ef4444;
                --kc-error-bg: rgba(239, 68, 68, 0.1);
                --kc-radius: 12px;
                --kc-radius-sm: 8px;
            }

            /* Body y HTML */
            html, body {
                width: 100% !important;
                height: 100% !important;
                min-height: 100vh !important;
                margin: 0 !important;
                padding: 0 !important;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                font-size: 14px !important;
                line-height: 1.5 !important;
                background: var(--kc-bg) !important;
                color: var(--kc-text) !important;
                -webkit-font-smoothing: antialiased !important;
            }

            /* Ocultar TODOS los elementos de Keycloak */
            #kc-header,
            #kc-header-wrapper,
            .kc-logo-text,
            .login-pf-header,
            #kc-locale,
            .pf-c-login__header,
            .pf-c-brand,
            .kc-feedback-text,
            .alert-link,
            #kc-info,
            #kc-info-wrapper {
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
                width: 0 !important;
                overflow: hidden !important;
            }

            /* Reset contenedores de Keycloak */
            .login-pf,
            .login-pf body,
            #kc-container,
            #kc-container-wrapper,
            .pf-c-login,
            .pf-c-login__container {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                min-height: 100vh !important;
                background: var(--kc-bg) !important;
                padding: 0 !important;
                margin: 0 !important;
            }

            #kc-content,
            #kc-content-wrapper,
            .pf-c-login__main,
            .card-pf {
                width: 100% !important;
                max-width: 420px !important;
                margin: 0 auto !important;
                padding: 24px !important;
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
            }

            /* ========================================
               ESTILOS DEL FORMULARIO
               ======================================== */

            .enodl-login-wrapper {
                width: 100%;
                max-width: 420px;
                margin: 0 auto;
                padding: 24px;
            }

            .enodl-brand {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                margin-bottom: 32px !important;
            }

            .enodl-logo {
                width: 44px;
                height: 44px;
                background: var(--kc-primary);
                border-radius: var(--kc-radius-sm);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #0f0f0f;
                font-size: 15px;
                font-weight: 700;
                letter-spacing: -0.02em;
            }

            .enodl-brand-text {
                font-size: 18px;
                font-weight: 600;
                color: var(--kc-text);
                letter-spacing: -0.01em;
            }

            .enodl-card {
                background: var(--kc-surface);
                border: 1px solid var(--kc-border);
                border-radius: var(--kc-radius);
                padding: 32px !important;
            }

            .enodl-header {
                text-align: center;
                margin-bottom: 28px !important;
            }

            .enodl-title {
                font-size: 22px !important;
                font-weight: 600 !important;
                color: var(--kc-text) !important;
                margin: 0 0 8px 0 !important;
                letter-spacing: -0.02em;
            }

            .enodl-subtitle {
                font-size: 14px !important;
                color: var(--kc-text-muted) !important;
                margin: 0 !important;
            }

            /* Alertas */
            .enodl-alert {
                padding: 12px 16px !important;
                border-radius: var(--kc-radius-sm) !important;
                font-size: 13px !important;
                margin-bottom: 24px !important;
                background: var(--kc-error-bg) !important;
                color: var(--kc-error) !important;
                border: 1px solid rgba(239, 68, 68, 0.2) !important;
            }

            .enodl-alert.warning {
                background: rgba(245, 158, 11, 0.1) !important;
                color: #f59e0b !important;
                border-color: rgba(245, 158, 11, 0.2) !important;
            }

            .enodl-alert.success {
                background: rgba(16, 185, 129, 0.1) !important;
                color: var(--kc-primary) !important;
                border-color: rgba(16, 185, 129, 0.2) !important;
            }

            .enodl-alert.info {
                background: rgba(59, 130, 246, 0.1) !important;
                color: #3b82f6 !important;
                border-color: rgba(59, 130, 246, 0.2) !important;
            }

            /* Proveedores de identidad */
            .enodl-idps {
                display: flex !important;
                flex-direction: column !important;
                gap: 10px !important;
                margin-bottom: 24px !important;
            }

            .enodl-idp-btn {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                height: 44px !important;
                padding: 0 16px !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                font-family: inherit !important;
                color: var(--kc-text) !important;
                background: transparent !important;
                border: 1px solid var(--kc-border) !important;
                border-radius: var(--kc-radius-sm) !important;
                text-decoration: none !important;
                cursor: pointer !important;
                transition: all 150ms ease !important;
            }

            .enodl-idp-btn:hover {
                background: rgba(255, 255, 255, 0.03) !important;
                border-color: #404040 !important;
            }

            /* Divisor */
            .enodl-divider {
                display: flex !important;
                align-items: center !important;
                gap: 16px !important;
                margin-bottom: 24px !important;
            }

            .enodl-divider::before,
            .enodl-divider::after {
                content: '' !important;
                flex: 1 !important;
                height: 1px !important;
                background: var(--kc-border) !important;
            }

            .enodl-divider span {
                font-size: 12px !important;
                color: var(--kc-text-subtle) !important;
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
            }

            /* Campos del formulario */
            .enodl-field {
                margin-bottom: 20px !important;
            }

            .enodl-label {
                display: block !important;
                font-size: 13px !important;
                font-weight: 500 !important;
                color: var(--kc-text) !important;
                margin-bottom: 8px !important;
            }

            .enodl-input {
                width: 100% !important;
                height: 44px !important;
                padding: 0 14px !important;
                font-size: 14px !important;
                font-family: inherit !important;
                color: var(--kc-text) !important;
                background: var(--kc-bg) !important;
                border: 1px solid var(--kc-border) !important;
                border-radius: var(--kc-radius-sm) !important;
                outline: none !important;
                transition: all 150ms ease !important;
            }

            .enodl-input:focus {
                border-color: var(--kc-primary) !important;
                box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
            }

            .enodl-input::placeholder {
                color: var(--kc-text-subtle) !important;
            }

            .enodl-field-error {
                font-size: 12px !important;
                color: var(--kc-error) !important;
                margin-top: 6px !important;
            }

            /* Checkbox recordar */
            .enodl-remember {
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                margin-bottom: 24px !important;
                cursor: pointer !important;
            }

            .enodl-remember input[type="checkbox"] {
                width: 16px !important;
                height: 16px !important;
                accent-color: var(--kc-primary) !important;
                cursor: pointer !important;
                margin: 0 !important;
            }

            .enodl-remember span {
                font-size: 13px !important;
                color: var(--kc-text-muted) !important;
            }

            /* Boton principal */
            .enodl-submit {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                height: 46px !important;
                padding: 0 20px !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                font-family: inherit !important;
                color: #0f0f0f !important;
                background: var(--kc-primary) !important;
                border: none !important;
                border-radius: var(--kc-radius-sm) !important;
                cursor: pointer !important;
                transition: all 150ms ease !important;
                margin-bottom: 16px !important;
            }

            .enodl-submit:hover {
                background: var(--kc-primary-hover) !important;
            }

            /* Enlaces */
            .enodl-links {
                text-align: center !important;
            }

            .enodl-links a {
                font-size: 13px !important;
                color: var(--kc-primary) !important;
                text-decoration: none !important;
                transition: color 150ms ease !important;
            }

            .enodl-links a:hover {
                color: var(--kc-primary-hover) !important;
                text-decoration: underline !important;
            }

            /* Responsive */
            @media (max-width: 480px) {
                .enodl-login-wrapper {
                    padding: 16px !important;
                }
                
                .enodl-card {
                    padding: 24px !important;
                }
            }
        </style>
    <#elseif section = "form">
        <div class="enodl-login-wrapper">
            <div class="enodl-brand">
                <div class="enodl-logo">DL</div>
                <div class="enodl-brand-text">ENO Data Lake</div>
            </div>

            <div class="enodl-card">
                <div class="enodl-header">
                    <h1 class="enodl-title">Iniciar sesion</h1>
                    <p class="enodl-subtitle">Accede al portal de servicios</p>
                </div>

                <#if message?has_content>
                    <div class="enodl-alert <#if message.type = 'error'>error<#elseif message.type = 'warning'>warning<#elseif message.type = 'success'>success<#else>info</#if>">
                        ${kcSanitize(message.summary)?no_esc}
                    </div>
                </#if>

                <#if social.providers??>
                    <div class="enodl-idps">
                        <#list social.providers as p>
                            <a class="enodl-idp-btn" href="${p.loginUrl}">${p.displayName}</a>
                        </#list>
                    </div>
                    <div class="enodl-divider"><span>o</span></div>
                </#if>

                <form id="kc-form-login" action="${url.loginAction}" method="post">
                    <div class="enodl-field">
                        <label for="username" class="enodl-label">${msg("username")}</label>
                        <input 
                            id="username" 
                            name="username" 
                            type="text" 
                            class="enodl-input" 
                            autofocus 
                            autocomplete="username" 
                            value="${(login.username!'')}" 
                            placeholder="Introduce tu usuario" 
                        />
                        <#if messagesPerField.existsError('username')>
                            <div class="enodl-field-error">${kcSanitize(messagesPerField.get('username'))?no_esc}</div>
                        </#if>
                    </div>

                    <div class="enodl-field">
                        <label for="password" class="enodl-label">${msg("password")}</label>
                        <input 
                            id="password" 
                            name="password" 
                            type="password" 
                            class="enodl-input" 
                            autocomplete="current-password" 
                            placeholder="Introduce tu contrasena" 
                        />
                        <#if messagesPerField.existsError('password')>
                            <div class="enodl-field-error">${kcSanitize(messagesPerField.get('password'))?no_esc}</div>
                        </#if>
                    </div>

                    <#if realm.rememberMe && !usernameEditDisabled??>
                        <label class="enodl-remember">
                            <input id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if> />
                            <span>${msg("rememberMe")}</span>
                        </label>
                    </#if>

                    <button class="enodl-submit" type="submit">${msg("doLogIn")}</button>

                    <#if realm.resetPasswordAllowed>
                        <div class="enodl-links">
                            <a href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                        </div>
                    </#if>
                </form>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>
