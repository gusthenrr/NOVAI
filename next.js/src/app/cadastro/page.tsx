'use client'
import React, {useState, useEffect } from 'react';

// Simulando a variável de ambiente para a URL da API
// SUBSTITUA PELA SUA URL REAL DA API
const URL=`${process.env.NEXT_PUBLIC_API_URL}`

const App = () => {
  const [usuario, setUsuario] = useState(''); // Alterado de username
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState(''); // Alterado de password
  const [confirmarSenha, setConfirmarSenha] = useState(''); // Alterado de confirmPassword
  const [passwordError, setPasswordError] = useState('');

  const currentYear = new Date().getFullYear();

  const handleSubmit =  (event: React.FormEvent<HTMLFormElement>) => {
    // Não limpa o passwordError aqui ainda, pois pode ser setado abaixo
    // setPasswordError('');

    if (senha !== confirmarSenha) {
      console.error("As senhas não coincidem!");
      setPasswordError("As senhas não coincidem. Por favor, verifique.");
      event.preventDefault(); // IMPEDE o envio padrão do formulário se as senhas não baterem
      return;
    }

    // Se as senhas coincidirem, o formulário será enviado nativamente pelo navegador
    // usando os atributos action e method.
    // Nenhuma lógica de fetch é necessária aqui.
    console.log('Validação client-side passou. Permitindo envio nativo do formulário.');
    // Opcional: Limpar o formulário aqui pode não ser ideal,
    // pois a página provavelmente recarregará após o POST.
    // O backend deve lidar com o redirecionamento ou a resposta.
  };

  // Limpar mensagem de erro ao digitar nos campos de senha
  useEffect(() => {
    if (passwordError && senha && confirmarSenha) { // Adicionado verificação de senha e confirmarSenha
      if (senha === confirmarSenha) {
        setPasswordError('');
      }
    }
  }, [senha, confirmarSenha, passwordError]);


  return (
    <>
      <style>
        {`
          :root {
            --primary-black: #1A1A1A;
            --primary-white: #FFFFFF;
            --secondary-yellow: rgb(253, 244, 110);
            --light-gray: rgb(230, 229, 229);
            --text-gray: #555555;
            --input-border-gray: #DCDCDC;
            --error-red: #dc3545; /* Cor para mensagens de erro */
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Roboto', sans-serif;
            background-color: var(--primary-white);
            color: var(--primary-black);
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            position: relative;
            overflow-x: hidden;
          }

          body::before {
            content: "";
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            background-image:
                /* url('https://placehold.co/1920x1080/e6e5e5/fdf46e?text=Sua+Imagem+Aqui&font=montserrat'), */
                url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e6e5e5' fill-opacity='0.1'%3E%3Cpath d='M12 10v-2h-2v2H8v2h2v2h2v-2h2v-2h-2zm0 72V80h-2v2H8v2h2v2h2v-2h2v-2h-2zM80 10v-2h-2v2h-2v2h2v2h2v-2h2v-2h-2zm0 72V80h-2v2h-2v2h2v2h2v-2h2v-2h-2zM12 44v-2h-2v2H8v2h2v2h2v-2h2v-2h-2zM80 44v-2h-2v2h-2v2h2v2h2v-2h2v-2h-2zM44 10v-2h-2v2h-2v2h2v2h2v-2h2v-2h-2zm0 72V80h-2v2h-2v2h2v2h2v-2h2v-2h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
            background-repeat: no-repeat, repeat;
            background-position: center center, center center;
            background-size: cover, auto;
            opacity: 0.5;
          }

          .header-bar {
            width: 100%;
            background-color: var(--primary-black);
            padding: 20px 50px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            position: relative;
            z-index: 2;
          }

          .logo {
            font-family: 'Montserrat', sans-serif;
            font-size: 1.8em;
            font-weight: 700;
            color: var(--primary-white);
            letter-spacing: 1px;
          }

          .logo-n {
            position: fixed;
            bottom: 20px;
            left: 20px;
            font-family: 'Montserrat', sans-serif;
            font-size: 1.5em;
            font-weight: 700;
            color: var(--primary-black);
            background-color: var(--primary-white);
            padding: 5px 10px;
            border-radius: 50%;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            z-index: 10;
          }

          .main-content {
            flex-grow: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 40px 20px;
          }

          .signup-container {
            background-color: var(--primary-white);
            padding: 40px 50px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
            width: 100%;
            max-width: 480px;
            text-align: center;
            border-top: 5px solid var(--secondary-yellow);
            position: relative;
            z-index: 1;
          }

          .signup-container h1 {
            font-family: 'Montserrat', sans-serif;
            font-size: 2.2em;
            font-weight: 600;
            color: var(--primary-black);
            margin-bottom: 15px;
          }

          .signup-container p.subtitle {
            font-size: 1.1em;
            color: var(--text-gray);
            margin-bottom: 35px;
            line-height: 1.5;
          }

          .form-group {
            margin-bottom: 25px;
            text-align: left;
            position: relative;
          }

          .form-group label {
            display: block;
            font-size: 0.95em;
            font-weight: 500;
            color: var(--text-gray);
            margin-bottom: 8px;
          }

          .form-group .input-wrapper {
            position: relative;
          }

          .form-group input[type="text"],
          .form-group input[type="email"],
          .form-group input[type="password"] {
            width: 100%;
            padding: 14px 18px;
            padding-left: 45px;
            border: 1px solid var(--input-border-gray);
            border-radius: 8px;
            font-size: 1em;
            color: var(--primary-black);
            background-color: #F9F9F9;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
          }

          .form-group input[type="text"]:focus,
          .form-group input[type="email"]:focus,
          .form-group input[type="password"]:focus {
            outline: none;
            border-color: var(--secondary-yellow);
            box-shadow: 0 0 0 3px rgba(253, 244, 110, 0.3);
          }
          
          .form-group input.input-error {
             border-color: var(--error-red);
          }

          .form-group .input-icon {
            position: absolute;
            left: 15px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-gray);
            font-size: 1.1em;
          }
          
          .password-error-message {
            font-size: 0.85em;
            color: var(--error-red);
            margin-top: -15px; 
            margin-bottom: 15px; 
            text-align: left;
            display: block; 
          }

          .submit-btn {
            width: 100%;
            background-color: var(--primary-black);
            color: var(--primary-white);
            border: none;
            padding: 16px;
            border-radius: 8px;
            font-family: 'Montserrat', sans-serif;
            font-size: 1.1em;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
            margin-top: 10px;
            letter-spacing: 0.5px;
          }

          .submit-btn:hover {
            background-color: #333;
            transform: translateY(-2px);
          }
          .submit-btn:active {
            transform: translateY(0);
          }

          .login-link {
            margin-top: 30px;
            font-size: 0.95em;
            color: var(--text-gray);
          }

          .login-link a {
            color: var(--secondary-yellow);
            font-weight: 600;
            text-decoration: none;
            transition: color 0.3s ease;
          }
          .login-link a:hover {
            color: #e0d650;
            text-decoration: underline;
          }

          .footer-text {
            text-align: center;
            padding: 20px 0;
            font-size: 0.85em;
            color: var(--text-gray);
            position: relative;
            z-index: 1;
          }

          @media (max-width: 768px) {
            .header-bar { padding: 15px 25px; }
            .logo { font-size: 1.6em; text-align: center; width: 100%; margin-bottom: 10px; }
            .main-content { padding: 20px 15px; }
            .signup-container { padding: 30px 25px; margin: 20px auto; }
            .signup-container h1 { font-size: 1.9em; }
            .signup-container p.subtitle { font-size: 1em; margin-bottom: 25px; }
            .form-group input[type="text"],
            .form-group input[type="email"],
            .form-group input[type="password"] { padding: 12px 15px; padding-left: 40px; }
            .form-group .input-icon { font-size: 1em; }
            .submit-btn { padding: 14px; font-size: 1em; }
            .logo-n { font-size: 1.2em; bottom: 15px; left: 15px; }
          }

          @media (max-width: 480px) {
            .signup-container { border-top-width: 4px; padding: 25px 20px; }
            .header-bar { padding: 15px 20px; }
            .logo { font-size: 1.5em; }
            .signup-container h1 { font-size: 1.7em; }
            .signup-container p.subtitle { font-size: 0.95em; }
          }
        `}
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet" />
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet" />

      <header className="header-bar">
         <div style={{width:"8rem", marginLeft:"3rem"}}>
          <img
            src="/novai_sem_fundo_branco.png" // Caminho da imagem na pasta "public"
            alt="Logo Novai"
            style={{ width: "100%", height: "auto", justifyContent:"center", alignItems:"center"}}
          />
          </div>
      </header>

      <main className="main-content">
        <div className="signup-container">
          <h1>Seja Bem-vindo!</h1>
          <p className="subtitle">Crie sua conta para automatizar suas vendas e atendimento com inteligência.</p>

          {/* Formulário agora usa action e method */}
          <form
            id="signupForm"
            action={`${URL}/add-usuario`}
            method="POST"
            onSubmit={handleSubmit} // Ainda chama handleSubmit para validação client-side
          >
            <div className="form-group">
              <label htmlFor="nomeUsuario">Nome de Usuário</label>
              <div className="input-wrapper">
                <i className="fas fa-user input-icon"></i>
                <input
                  type="text"
                  id="nomeUsuario" // id para o label
                  name="usuario"   // name para o envio do formulário
                  placeholder="Ex: seu_usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="input-wrapper">
                <i className="fas fa-envelope input-icon"></i>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Ex: seuemail@dominio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="senha">Senha</label>
              <div className="input-wrapper">
                <i className="fas fa-lock input-icon"></i>
                <input
                  type="password"
                  id="senha"
                  name="senha"
                  placeholder="Mínimo 8 caracteres"
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmarSenha">Confirmar Senha</label>
              <div className="input-wrapper">
                <i className="fas fa-check-circle input-icon"></i>
                <input
                  type="password"
                  id="confirmarSenha" // id para o label
                  name="confirmar_senha_cliente" // Este campo não precisa ser enviado, mas pode ter um name se desejado
                  placeholder="Repita sua senha"
                  value={confirmarSenha}
                  onChange={(e) => {
                    setConfirmarSenha(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  required
                  minLength={8}
                  className={passwordError ? 'input-error' : ''}
                />
              </div>
              {passwordError && <span className="password-error-message">{passwordError}</span>}
            </div>

            <button type="submit" className="submit-btn">Cadastrar</button>
          </form>

          <p className="login-link">
            Já possui uma conta? <a href="/login">Faça login</a>
          </p>
        </div>
      </main>

      <div className="logo-n">N</div>

      <footer className="footer-text">
        &copy; <span id="currentYear">{currentYear}</span> NOVAI. Todos os direitos reservados.
      </footer>
    </>
  );
};

export default App;
