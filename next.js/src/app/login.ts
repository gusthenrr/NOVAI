// Lida com a lógica de login e comunicação com o back-end
export async function handleLogin(email: string, password: string) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        console.log(data.token);
        // Retorna os dados em caso de sucesso
        return { success: true, data };
      } else {
        // Retorna o erro do servidor
        return { success: false, message: data.message };
      }
    } catch (error) {
      // Retorna erro de rede
      return { success: false, message: 'Erro de rede. Tente novamente mais tarde.' };
    }
  }
  