const pty = require('child_process');

console.log('Running prisma migrate dev...');
const child = pty.spawn('npx.cmd', ['prisma', 'migrate', 'dev', '--name', 'add_auditoria'], {
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});
