import React from 'react';

// Componente Header
function Header() {
  return (
    <header>
      <div style={{width:"8rem", marginLeft:"3rem"}}>
          <img
            src="/novai_sem_fundo.png" // Caminho da imagem na pasta "public"
            alt="Logo Novai"
            style={{ width: "100%", height: "auto", justifyContent:"center", alignItems:"center"}}
          />
          </div>
      <div className="buttons">
        <a href="/cadastro" className="button get-started">Começar</a>
        <a href="/login" className="button login">Login</a>
      </div>
    </header>
  );
}

// Componente Hero
function Hero() {
  return (
    <section className="hero">
      <h1>Diga adeus às <span className="highlight">tarefas manuais</span> 👋</h1>
      <p>Nós fornecemos soluções inovadoras para otimizar e automatizar seus fluxos de trabalho e processos.</p>
    </section>
  );
}

// Componente Principal App
function LandingPage() {
  // It's generally recommended to put global styles in a separate CSS file (e.g., index.css or App.css)
  // and import it. For self-contained examples, embedding is sometimes done.
  // Note: Styling the `body` tag directly like this from a component can have limitations
  // and might be better handled in a global CSS file or via index.html.
  const globalStyles = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
      margin: 0;
      padding: 0;
      background-color: #FFFFFF; /* Primary White */
      color: #000000; /* Primary Black for default text */
      /* display: flex; flex-direction: column; align-items: center; justify-content: flex-start; */ /* Moved to .app-container */
      min-height: 100vh;
      overflow-x: hidden; /* Prevent horizontal scroll from blurred shapes */
      position: relative; /* For positioning abstract shapes */
    }
  `;

  const componentStyles = `
    .app-container {
      display: flex;
      flex-direction: column;
      align-items: center; /* Center content horizontally */
      justify-content: flex-start;
      width: 100%; /* Ensure the container takes full width */
    }

    /* Header Styles */
    header {
        display: flex;
        justify-content: space-between;
        padding: 25px 50px; /* Increased padding slightly */
        width: 100%;
        box-sizing: border-box;
        max-width: 1800px; /* Max width for header content */
        margin-top: 20px;
        z-index: 10; /* Ensure header is above abstract shapes if they overlap */
    }

    .logo {
        font-size: 2.2em; /* Slightly larger logo */
        font-weight: bold;
        color: #000000; /* Primary Black */
    }

    .buttons {
        display: flex;
        gap: 15px; /* Increased gap between buttons */
    }

    .button {
        padding: 12px 24px; /* Slightly larger buttons */
        border: none;
        border-radius: 25px; /* More rounded corners */
        color: #FFFFFF; /* Primary White for text */
        cursor: pointer;
        font-size: 1em;
        font-weight: 500;
        text-decoration: none;
        transition: background-color 0.3s ease, transform 0.2s ease;
    }

    .button:hover {
        transform: translateY(-2px); /* Slight lift on hover */
    }

    .get-started, .login {
        background-color: #000000; /* Primary Black */
    }
    .get-started:hover, .login:hover {
        background-color: #333333; /* Darken on hover */
    }

    /* Main Content Styles */
    main {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        padding: 0 20px; /* Padding for smaller screens */
        box-sizing: border-box;
        z-index: 10; /* Ensure main content is above abstract shapes */
    }

    /* Hero Section Styles */
    .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 60px 20px; /* Increased padding */
        max-width: 800px; /* Max width for hero content */
        margin-top: 40px; /* Space from header */
    }

    .hero h1 {
        font-size: 3.2em; /* Slightly larger heading */
        font-weight: 700; /* Bolder */
        margin-bottom: 20px;
        color: #000000; /* Primary Black */
        line-height: 1.2;
    }

    .hero h1 span.highlight { /* Targeting the span with class "highlight" */
        color: #FFEEA2; /* Primary Light Yellow */
    }

    .hero p {
        font-size: 1.15em; /* Slightly larger paragraph */
        color: #555555; /* Secondary Gray Text */
        margin-bottom: 35px;
        line-height: 1.6;
        max-width: 600px; /* Constrain paragraph width */
    }

    /* Trusted By Section Styles (CSS from original, HTML part was not in the selected body) */
    .trusted-by {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        padding: 40px 20px; /* Adjusted padding */
        box-sizing: border-box;
        margin-top: 30px; /* Adjusted space from hero */
        max-width: 900px; /* Max width for this section */
    }

    .trusted-by h2 {
        font-size: 1em;
        color: #AAAAAA; /* Secondary Light Gray Text */
        margin-bottom: 25px;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .brands {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 40px; /* Increased gap */
        flex-wrap: wrap; /* Allow brands to wrap on smaller screens */
        color: #333333; /* Darker Gray for brand names */
    }

    .brands span {
        font-weight: 600; /* Bolder brand names */
        font-size: 1.1em;
    }

    /* Abstract Shapes in Background */
    .abstract-shape {
        position: absolute; /* These will be positioned relative to the body or the nearest positioned ancestor */
        background-color: #FFEEA2; /* Primary Light Yellow */
        opacity: 0.4; /* Slightly more visible */
        z-index: 0; /* Behind other content */
        filter: blur(50px); /* Increased blur for softer edges */
        border-radius: 50%;
    }

    .abstract-shape-top-left {
        width: 400px; /* Larger */
        height: 300px;
        top: 1%;
        left: -80px; /* Positioned more off-screen */
    }

    .abstract-shape-bottom-right {
        width: 400px; /* Larger */
        height: 300px; /* More elongated */
        bottom: 5%;
        right: -70px; /* Positioned more off-screen */
        border-radius: 60% 40% 30% 70% / 50% 60% 40% 50%; /* More organic shape */
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
        header {
            padding: 20px 25px;
            flex-direction: column; /* Stack logo and buttons on small screens */
            gap: 15px;
            margin-top: 10px;
        }

        .logo {
            font-size: 1.8em;
        }

        .hero h1 {
            font-size: 2.5em;
        }

        .hero p {
            font-size: 1em;
        }

        .buttons {
            justify-content: center; /* Center buttons when stacked */
            width: 100%;
        }
        .button {
            padding: 10px 20px;
            font-size: 0.9em;
        }

        .brands { /* Styles for .brands if it were present */
            gap: 20px;
        }
        .brands span { /* Styles for .brands span if it were present */
            font-size: 1em;
        }

        .abstract-shape-top-left {
            width: 150px;
            height: 150px;
            top: 2%;
            left: -50px;
            filter: blur(30px);
        }

        .abstract-shape-bottom-right {
            width: 120px;
            height: 180px;
            bottom: 2%;
            right: -40px;
            filter: blur(30px);
        }
    }

    @media (max-width: 480px) {
        .hero h1 {
            font-size: 2em;
        }
        .hero p {
            font-size: 0.9em;
        }
        .trusted-by h2 { /* Styles for .trusted-by h2 if it were present */
            font-size: 0.9em;
        }
        .brands span { /* Styles for .brands span if it were present */
            font-size: 0.9em;
            gap: 15px; /* Note: gap on span might not be intended, usually on parent .brands */
        }
    }
  `;

  return (
    <>
      {/* Apply global styles (for body) and component-specific styles */}
      <style>{globalStyles}</style>
      <style>{componentStyles}</style>
      
      {/* Abstract shapes are positioned relative to the body due to globalStyles */}
      <div className="abstract-shape abstract-shape-top-left"></div>
      <div className="abstract-shape abstract-shape-bottom-right"></div>

      <div className="app-container"> {/* This div will handle the main flex layout */}
        <Header />
        <main>
          <Hero />
          {/* The "Trusted By" section's HTML was not in the provided body selection.
              If you want to include it, you can uncomment the following JSX
              and ensure its styles are correctly applied.
          */}
          {/*
          <section className="trusted-by">
            <h2>Com a confiança de</h2>
            <div className="brands">
              <span>Penta</span>
              <span>Chain</span>
              <span>Glossy</span>
              <span>Sitemark</span>
              <span>Leafe</span>
              <span>Automation</span>
            </div>
          </section>
          */}
        </main>
      </div>
    </>
  );
}

export default LandingPage;
