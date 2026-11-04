// Presentation hints cannot grant scopes or change approval mode.
export function hostCapabilities(hints={chat:true,text_input:true,speech_input:false}){
 if(!hints||Array.isArray(hints)||typeof hints!=='object'||Object.keys(hints).some(k=>!['chat','text_input','speech_input'].includes(k))||Object.values(hints).some(v=>typeof v!=='boolean'))throw Error('invalid_host_capabilities');
 return {experimental:{kloudy:{...hints}}};
}
export function readHostInterface(value){
 if(value===undefined)return null; // Older engines remain usable, without invented negotiation.
 if(value?.version!=='kloudy.host-interface/1'||!['host','kloudy'].includes(value.conversation_renderer)||!['host','kloudy'].includes(value.text_input)||value.authorization_changed!==false||value.duplicate_chat_required!==false||value.duplicate_text_input_required!==false||value.voice?.engine_audio_capture!==false||value.voice?.engine_speech_synthesis!==false||value.subscription_text_planning?.requires_entitlement!==true||value.subscription_text_planning?.provider!=='nvidia'||value.bot_boozle?.required!==false)throw Error('invalid_host_interface');
 return structuredClone(value);
}
