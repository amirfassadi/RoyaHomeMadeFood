export async function secretPrompt(label='Password (12–128 characters, hidden): '){
 if(!process.stdin.isTTY)throw new Error('Use an interactive terminal; passwords are not accepted as command arguments');
 process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise<string>((resolve,reject)=>{let value='';const listener=(chunk:Buffer)=>{for(const char of chunk.toString('utf8')){
  if(char==='\u0003'){cleanup();reject(new Error('Cancelled'));return;}
  if(char==='\r'||char==='\n'){cleanup();resolve(value);return;}
  if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' ' && value.length<129)value+=char;
 }};function cleanup(){process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}process.stdin.on('data',listener);});
}
