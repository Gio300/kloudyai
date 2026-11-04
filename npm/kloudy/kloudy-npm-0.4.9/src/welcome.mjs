export const cloudVisual=String.raw`        .--------.
    .---'  .--.  '---.
 .-'   .--'    '--.   '-.
(      [ K L O U D Y ]   )
 '----.____________.----'
       :: BOT WIDE WEB ::`;
export const welcomeText='Welcome to Kloudy. You are at the Bot Wide Web door. Just type Kloudy to direct this IDE here; it can also use Kloudy for relevant tasks without that prefix. Only the tools needed for this project come in.';
export const welcomeContent=result=>[{type:'text',text:'```text\n'+cloudVisual+'\n```\n\n'+welcomeText+'\n\n'+JSON.stringify(result)}];
