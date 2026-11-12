import { senderStats } from '../src/senders.ts';

const s = senderStats();
const pct = (n: number) => (n * 100).toFixed(1) + '%';
console.log(`vendors                      ${s.vendors}`);
console.log(`vendors with a sender entry  ${s.vendorsWithSender}`);
console.log(`addresses                    ${s.addresses}`);
console.log(`domains                      ${s.domains}`);
console.log(`entries (addresses+domains)  ${s.entries}`);
console.log(`verified entries             ${s.verifiedEntries} (${pct(s.verifiedShare)})`);
console.log(`vendors with a verified one  ${s.vendorsWithVerified}`);
console.log(`vendors with sources         ${s.vendorsWithSources}`);
console.log(`vendors with no verified     ${s.vendorsWithoutVerified.length}`);
console.log(s.vendorsWithoutVerified.join(', '));
