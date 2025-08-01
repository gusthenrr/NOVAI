import React, {FC} from 'react';

interface LoadingRobotScreenProps {
  message?: string;
}

const LoadingRobotScreen = ({ message = "Carregando..." }:LoadingRobotScreenProps) => {
  const primaryYellow = "rgb(253, 244, 110)";
  const primaryBlack = "#1A1A1A";
  const primaryWhite = "#FFFFFF";
  const lightGray = "rgba(230, 229, 229, 0.5)";
  const darkGray = "#333333";

  return (
    <>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @keyframes swing { /* Animação das pernas */
            0% { transform: rotate(-25deg); }
            50% { transform: rotate(25deg); }
            100% { transform: rotate(-25deg); }
          }
          
          @keyframes antennaWave { /* Animação da antena */
            0% { transform: rotate(-5deg); }
            50% { transform: rotate(5deg); }
            100% { transform: rotate(-5deg); }
          }

          /* Animação de aceno modificada para manter a mão mais para cima */
          @keyframes waveHand {
            0% { transform: rotate(210deg); }   /* Posição inicial já elevada */
            25% { transform: rotate(250deg); }  /* Acena bem para cima */
            50% { transform: rotate(220deg); }  /* Posição mais "baixa" do ciclo, ainda bem elevada */
            75% { transform: rotate(250deg); }  /* Acena bem para cima novamente */
            100% { transform: rotate(210deg); } /* Retorna à posição inicial elevada */
          }

          .loading-robot-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: white;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            font-family: 'Roboto', sans-serif;
          }

          .robot-and-spinner-container {
            position: relative;
            width: 150px;
            height: 150px;
            display: flex;
            justify-content: center;
            align-items: flex-end;
          }

          .loading-circle-spinner {
            position: absolute;
            bottom: -20px;
            width: 100px;
            height: 100px;
            border: 8px solid ${lightGray};
            border-top: 8px solid ${primaryYellow};
            border-radius: 50%;
            animation: spin 1.2s linear infinite;
          }

          .robot-body-sitting { 
            width: 60px;
            height: 50px;
            background-color: ${primaryBlack};
            border-radius: 10px 10px 20px 20px;
            position: relative;
            z-index: 10;
            border: 2px solid ${darkGray};
            box-shadow: 0px 2px 5px rgba(0,0,0,0.2);
          }

          .robot-head {
            width: 45px;
            height: 40px;
            background-color: ${primaryBlack};
            border-radius: 20px 20px 5px 5px;
            position: absolute;
            top: -30px;
            left: 50%;
            transform: translateX(-50%);
            border: 2px solid ${darkGray};
            box-shadow: 0px -2px 3px rgba(0,0,0,0.1);
          }
          
          .robot-eye {
            width: 10px;
            height: 10px;
            background-color: ${primaryYellow};
            border-radius: 50%;
            position: absolute;
            top: 12px;
            box-shadow: 0 0 5px ${primaryYellow};
          }
          .robot-eye.left { left: 8px; }
          .robot-eye.right { right: 8px; }

          .robot-antenna {
            width: 4px;
            height: 15px;
            background-color: ${darkGray};
            position: absolute;
            top: -12px;
            left: 50%;
            transform-origin: bottom center;
            transform: translateX(-50%);
            border-radius: 2px 2px 0 0;
            animation: antennaWave 2s ease-in-out infinite;
          }
          .robot-antenna-tip {
            width: 8px;
            height: 8px;
            background-color: ${primaryYellow};
            border-radius: 50%;
            position: absolute;
            top: -6px;
            left: 50%;
            transform: translateX(-50%);
            box-shadow: 0 0 5px ${primaryYellow};
          }

          /* Estilos para os braços */
          .robot-arm {
            width: 10px;
            height: 30px;
            background-color: ${primaryBlack};
            border: 1px solid ${darkGray};
            border-radius: 5px;
            position: absolute;
            top: 5px; /* Posição a partir do topo do corpo */
            transform-origin: top center; /* Ponto de rotação no "ombro" */
          }

          .robot-arm.left {
            left: -3px; /* Posição do braço esquerdo (para fora do corpo) */
            transform: rotate(20deg); /* Posição inicial do braço esquerdo */
          }

          .robot-arm.right {
            right: -3px; 
            /* Posição inicial estática AGORA CORRESPONDE ao primeiro frame da animação waveHand */
            transform: rotate(210deg); /* <<<<<<< MUDANÇA AQUI */
            animation: waveHand 2s ease-in-out infinite; 
            animation-delay: 0.5s; 
          }
          
          .robot-hand {
            width: 12px;
            height: 12px;
            background-color: ${primaryWhite};
            border: 1px solid ${darkGray};
            border-radius: 50%; /* Mão redonda */
            position: absolute;
            bottom: -6px; /* No final do braço */
            left: 50%;
            transform: translateX(-50%);
            box-shadow: 0px 1px 1px rgba(0,0,0,0.1);
          }


          .robot-leg {
            width: 12px;
            height: 35px;
            background-color: ${primaryBlack};
            border: 1px solid ${darkGray};
            border-radius: 6px;
            position: absolute;
            bottom: -25px;
            transform-origin: top center;
            animation: swing 1.8s ease-in-out infinite;
          }

          .robot-leg.left {
            left: 10px;
            transform: rotate(-15deg);
          }

          .robot-leg.right {
            right: 10px;
            animation-delay: -0.9s;
            transform: rotate(15deg);
          }

          .robot-foot {
            width: 18px;
            height: 10px;
            background-color: ${primaryWhite};
            border: 1px solid ${darkGray};
            border-radius: 5px;
            position: absolute;
            bottom: -5px;
            left: 50%;
            transform: translateX(-50%);
            box-shadow: 0px 1px 2px rgba(0,0,0,0.2);
          }

          .loading-text-message {
            margin-top: 30px;
            font-size: 1.2em;
            color: ${primaryBlack};
            font-weight: 500;
          }
        `}
      </style>
      <div className="loading-robot-overlay">
        <div className="robot-and-spinner-container">
          <div className="robot-body-sitting">
            <div className="robot-head">
              <div className="robot-antenna">
                <div className="robot-antenna-tip"></div>
              </div>
              <div className="robot-eye left"></div>
              <div className="robot-eye right"></div>
            </div>
            {/* Adicionando os braços */}
            <div className="robot-arm left">
              <div className="robot-hand"></div>
            </div>
            <div className="robot-arm right">
              <div className="robot-hand"></div>
            </div>
            {/* Fim da adição dos braços */}
            <div className="robot-leg left">
              <div className="robot-foot"></div>
            </div>
            <div className="robot-leg right">
              <div className="robot-foot"></div>
            </div>
          </div>
          <div className="loading-circle-spinner"></div>
        </div>
        <p className="loading-text-message">{message}</p>
      </div>
    </>
  );
};

export default LoadingRobotScreen;
