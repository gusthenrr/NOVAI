// ARQUIVO: ../componentesGerais/TreinarIA.tsx

import React,{FC} from 'react';

// Estilos APENAS do painel
const styles = `
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.4s ease, visibility 0s 0.4s; /* Atraso na visibilidade para a animação de saída */
    z-index: 1001;
  }

  .overlay.open {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.4s ease;
  }
  
  .settings-panel {
    position: fixed;
    top: 0;
    right: -450px; /* Começa fora da tela */
    width: 100%;
    max-width: 420px;
    height: 100%;
    background-color: #FAFAFA;
    box-shadow: -5px 0 25px rgba(0, 0, 0, 0.15);
    transition: right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    z-index: 1002;
    border-left: 1px solid #EEE;
    display: flex;
    flex-direction: column;
  }

  /* ESTA É A CLASSE QUE FAZ A MÁGICA */
  .settings-panel.open {
    right: 0;
  }

  /* --- O resto dos seus estilos permanece igual --- */

  .panel-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #EEE; background-color: #fff; }
  .panel-header h3 { margin: 0; font-size: 18px; color: #333; font-weight: 600; }
  .close-btn { background: none; border: none; font-size: 28px; line-height: 1; font-weight: 300; color: #888; cursor: pointer; padding: 4px; transition: color 0.2s, transform 0.2s; }
  .close-btn:hover { color: #111; transform: rotate(90deg); }
  .panel-body { padding: 24px; flex-grow: 1; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; }
  .auto-reply-section { background-color: #fff; border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
  .auto-reply-section span { font-weight: 500; color: #555; font-size: 15px; }
  .config-sections { display: flex; gap: 20px; flex-grow: 1; }
  .left-section, .right-section { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .left-section { background-color: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); justify-content: center; align-items: center; }
  .placeholder-text { color: #ccc; font-size: 14px; text-align: center; }
  .train-ia-button { width: 100%; padding: 12px; background-color: #212121; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; transition: background-color 0.3s ease, transform 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .train-ia-button:hover { background-color: #333; transform: translateY(-2px); }
  .switch { position: relative; display: inline-block; width: 50px; height: 28px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 28px; }
  .slider:before { position: absolute; content: "N"; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: #999; }
  input:checked + .slider { background-color: #FFC700; }
  input:focus + .slider { box-shadow: 0 0 1px #FFC700; }
  input:checked + .slider:before { transform: translateX(22px); color: #111; }
`;

const BrainIcon: FC = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.98-1.57A2.5 2.5 0 0 1 5 15.5V12a2.5 2.5 0 0 1 2.5-2.5h1.1A2.5 2.5 0 0 1 11 7V4.5a2.5 2.5 0 0 1 1-2z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.98-1.57A2.5 2.5 0 0 0 19 15.5V12a2.5 2.5 0 0 0-2.5-2.5h-1.1A2.5 2.5 0 0 0 13 7V4.5a2.5 2.5 0 0 0-1-2z" /></svg> );
const CustomizeIcon: FC = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.28 2.28a2.828 2.828 0 1 1-4 4L5.66 17.88a2.828 2.828 0 1 1-4 4L16.12 6.12a2.828 2.828 0 1 1 4-4zM5.66 6.12l12.24 12.24" /><path d="M12 12l6 6" /></svg> );

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isAutoReplyOn: boolean;       // Prop para saber se o modo automático está LIGADO
  onAutoReplyToggle: () => void; // Prop para a FUNÇÃO a ser chamada ao clicar
}

const SettingsPanel=({ isOpen, onClose,isAutoReplyOn,onAutoReplyToggle }:SettingsPanelProps) => {
  if (!isOpen) {
    return null;
  }
  return (
    <>
      <style>{styles}</style>
      {/* A LÓGICA CORRETA ESTÁ AQUI: */}
      <div className={`overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
      <div className={`settings-panel ${isOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h3>Respostas Automáticas - NOVAI</h3>
          <button onClick={onClose} className="close-btn" aria-label="Fechar painel">&times;</button>
        </div>
        <div className="panel-body">
          <div className="auto-reply-section">
            <span>Ativar respostas automáticas da IA</span>
            <label className="switch">
              <input 
                type="checkbox" 
                // REMOVEMOS 'defaultChecked'
                checked={isAutoReplyOn}     // O estado (ligado/desligado) vem do pai
                onChange={onAutoReplyToggle}  // Ao mudar, chama a função do pai
              />
              <span className="slider"></span>
            </label>
          </div>
          <div className="config-sections">
            <div className="left-section"> <strong className="placeholder-text">Novai</strong> </div>
            <div className="right-section">
              <button className="train-ia-button"> <CustomizeIcon /> Personalizar Respostas </button>
              <button className="train-ia-button"> <CustomizeIcon /> Testar Novai </button>
              <button className="train-ia-button"> <CustomizeIcon /> Análises Novai </button>

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;