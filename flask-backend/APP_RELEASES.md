# Aviso opcional de atualização do Precify

`GET /api/precify/app-release?platform=ios&channel=testflight` é público, não consulta o banco, não recebe JWT e retorna somente metadados de uma versão já disponível para seu grupo de testadores. Parâmetros inválidos retornam 404. Configuração ausente ou inválida retorna `{"release":null}`; a consulta nunca bloqueia o uso do app.

Configure `PRECIFY_APP_RELEASES_JSON` no Railway somente após o build estar processado/aprovado e adicionado ao grupo que usa o link. Exemplo ilustrativo: substitua o link e o número de build pelos valores reais; não publique este exemplo como se fosse um build disponível.

```json
{
  "ios": {
    "testflight": {
      "version": "1.0.8",
      "build": "3",
      "url": "https://testflight.apple.com/join/SEU_LINK",
      "notes": "Melhorias no cálculo de frete e na simulação."
    }
  }
}
```

O link deve ser um link público válido do grupo TestFlight. Não use links do App Store Connect, códigos individuais de convite ou o arquivo IPA. Se o grupo for somente por convite, crie um grupo/link público apropriado antes de ativar este aviso. O link não concede acesso a builds ainda indisponíveis ou não aprovados para aquele grupo.

A versão e o build são strings. Atualize ambos a cada liberação. Uma mudança de build dentro da mesma versão também gera aviso. Para suspender o aviso, remova a entrada ou use `{}`. O backend valida os campos e devolve somente `version`, `build`, `url`, `notes`, `platform`, `channel`; nenhuma outra chave da configuração é publicada.

Canais preparados: iOS `testflight` e `store`, Android `apk` e `store`. Links são restritos a TestFlight, App Store, Play Store do pacote com.precificador.app, ou artefatos APK permanentes da Expo. Não use links assinados temporários de download. A seleção por canal fica incorporada em `extra.releaseChannels` do app; atualmente iOS usa TestFlight e Android APK. Antes de publicar na App Store, trocar o canal iOS para `store` e configurar a versão/link correspondentes.

O app compara os números nativos de versão/build com a configuração, consulta ao abrir e ao retornar para primeiro plano (no máximo a cada 6 horas durante a execução). O usuário pode dispensar por 24 horas; uma versão diferente pode gerar novo aviso. Erros de rede não afetam login, cálculos ou navegação. O botão abre a página de distribuição e não instala silenciosamente. Expo Go, desenvolvimento e navegador não mostram esse aviso.

O build já instalado antes desta implementação não possui o aviso: é preciso atualizar manualmente uma vez pelo TestFlight. Esta solução não é EAS Update/OTA nem rastreia automaticamente builds na conta Apple. A publicação da configuração é uma etapa da liberação, depois de confirmar a disponibilidade para os testadores.
