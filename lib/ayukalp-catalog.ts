// Ayukalp UAP Pharma Pvt. Ltd. — Classical Products Catalog
// 202 unique products × ~4 variants = 750+ individual medicine entries
// Used by the "Import Ayukalp Catalog" button in Medicine Master

export const AYUKALP_COMPANY = 'AYUKALP UAP PHARMA PVT. LTD';
const HSN = '30049099';

function unit(packing: string): string {
  const p = packing.toUpperCase();
  if (p.includes('TAB')) return 'tab';
  if (p.includes('ML') || p.includes('LTR')) return 'ml';
  return 'gm'; // GM, MG, KG
}

interface RawProduct {
  name: string;
  category: string;
  packings: string[];
}

const RAW: RawProduct[] = [
  // ── VATI / GUTIKA ──────────────────────────────────────────────────
  { name: 'AGNI TUNDI VATI',                        category: 'Vati',       packings: ['80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'ANTRA VRIDDHIHAR GUTIKA',                category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'APTANTRAKARI VATI',                      category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'ARSHOGHNI VATI',                         category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'AROGYAVARDHINI GUTIKA (RASA)',            category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'ELADI GUTIKA',                           category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'KANKAYAN GUTIKA',                        category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'KUTAJ GHANVATI',                         category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'KANTH SUDHARAK VATI',                    category: 'Vati',       packings: ['5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'KHADIRADI VATI',                         category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'GANDHAK VATI',                           category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'GARBHPAL RASA VATI',                     category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'CHITRAKADI VATI',                        category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'CHANDANADI VATI',                        category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'CHANDRAPRABHA VATI',                     category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'PUNARNAVADI MANDUR VATI',                category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'PUSHPADHANVA RASA VATI',                 category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'PRATAP LANKESHWAR RASA VATI',            category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'PRABHAKAR VATI',                         category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'BRAHMI VATI',                            category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'BRAHMI VATI (S.M.Y)',                    category: 'Vati',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'BRIHAT SHANKH VATI',                     category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'MADHURANTAK VATI',                       category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'MADHURANTAK VATI (M.Y.)',                category: 'Vati',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'MAHAMANJISTHADI GHANVATI',               category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'MAHARASNADI GHANVATI',                   category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'MAMEJAVA GHANVATI',                      category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'RAJPRAVARTINI VATI',                     category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'LASUNADI VATI',                          category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'VYOSHADI VATI',                          category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'VISHTINDUK VATI (SILVER COATED)',        category: 'Vati',       packings: ['10 GM', '50 GM', '500 GM', '1 KG'] },
  { name: 'VRIDDHI VADHIKA VATI',                   category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHANKH VATI',                            category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHIRSHULADI VATI (VAJRA RASA)',          category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHILAJITVADI VATI',                      category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHILAJIT VATI (SHIVA GUTIKA)',           category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHOOLVARJINI VATI',                      category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SANSHAMANI VATI',                        category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SANJIVANI VATI',                         category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SARPAGANDHA GHANVATI',                   category: 'Vati',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SARIVADI VATI',                          category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SUDARSHAN GHANVATI',                     category: 'Vati',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },

  // ── RASA ───────────────────────────────────────────────────────────
  { name: 'ARJUNABHRA/NAGARJUNABHRA RASA',          category: 'Rasa',       packings: ['5 GM', '50 GM'] },
  { name: 'ARSH KUTHAR RASA',                       category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'ICHHABHEDI RASA',                        category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'UDAYADITYA RASA',                        category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'UNMAD GAJKESHARI RASA',                  category: 'Rasa',       packings: ['80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'EKANGVIR RASA',                          category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'KAMDUDHA RASA',                          category: 'Rasa',       packings: ['5 GM', '10 GM', '50 GM', '100 GM', '500 GM'] },
  { name: 'KAMDUDHA RASA (M.Y)',                    category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'KRIMI KUTHAR RASA',                      category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'KRAVYAD RASA',                           category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'GANDHAK RASAYAN',                        category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'CHANDRAKALA RASA',                       category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'CHANDRAMRIT RASA',                       category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'JALODARARI RASA',                        category: 'Rasa',       packings: ['80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'TARKESHWAR RASA',                        category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'TRIBHUVANKIRTI RASA',                    category: 'Rasa',       packings: ['80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'TRIVIKRAM RASA',                         category: 'Rasa',       packings: ['5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'NAVAJIVAN RASA',                         category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'NITYANAND RASA',                         category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'BAHUMUTRANTAK RASA',                     category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'MANMATHABHRA RASA',                      category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'VATAVIDHVANSAN RASA',                    category: 'Rasa',       packings: ['5 GM', '10 GM', '50 GM', '500 GM'] },
  { name: 'MANIKYA RASA',                           category: 'Rasa',       packings: ['5 GM', '10 GM', '50 GM', '500 GM'] },
  { name: 'MRITYUNJAYA RASA',                       category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'RASA SINDUR',                            category: 'Rasa',       packings: ['3 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'LAGHUMALINI VASANT',                     category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'LAXMIVILAS RASA',                        category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'VATGAJANKUSH RASA',                      category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'VATARI RASA',                            category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHRINGARABHRA RASA',                     category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHWASKUTHAR RASA',                       category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SUTSHEKHAR RASA',                        category: 'Rasa',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SUTSHEKHAR RASA (S.Y)',                  category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'SOMNATH RASA',                           category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SMRITI SAGAR RASA',                      category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'HRIDAYARNAVA RASA',                      category: 'Rasa',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'KUMAR KALYAN RASA (S.M.Y)',              category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'CHATURMUKH RASA (S.Y)',                  category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'JAYMANGAL RASA (S.H.Y)',                 category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'JAWAHAR MOHRA (S.H.Y)',                  category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'TRAILOKYA CHINTAMANI RASA (S.H.Y)',      category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'PRAVAL PANCHAMRIT RASA (S.H.Y.)',        category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'BRIHAT KASTURI BHAIRAV RASA (S.Y.)',     category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'BRIHAT PURNACHANDRA RASA (S.Y.)',        category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'BRIHAT BANGESHWAR RASA (S.M.Y.)',        category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'BRIHAT VATCHINTAMANI RASA (S.M.Y.)',     category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'MAHALAXMI VILAS RASA (S.Y.)',            category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'YOGENDRA RASA (S.M.Y)',                  category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'RASARAJ RASA (S.M.Y)',                   category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'VASANT KUSUMAKAR RASA (S.M.Y)',          category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'VATKULANTAK RASA',                       category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'SHAKRAVALLABH RASA (S.Y)',               category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'SWASKASH CHINTAMANI RASA (S.M.Y.)',      category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'SIDDHA MAKARDHWAJ SPECIAL (S.M.Y)',      category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'SUVARNA VASANT MALTI RASA (S.M.Y)',      category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'SUVARNA BHUPATI RASA (S.Y)',             category: 'Rasa',       packings: ['10 TAB', '30 TAB', '100 TAB'] },
  { name: 'MUGDHA RASA (PARAD TABLET)',             category: 'Rasa',       packings: ['50 TAB'] },

  // ── LOHA ───────────────────────────────────────────────────────────
  { name: 'TAPYADI LOHA',                           category: 'Loha',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'DHATRI LOHA',                            category: 'Loha',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'NAVAYAS LOHA',                           category: 'Loha',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'PRADARANTK RASA (LOHA)',                 category: 'Loha',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'YAKRITPLIHARI LOHA',                     category: 'Loha',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SAPTAMRIT LOHA',                         category: 'Loha',       packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SARVAJVARHAR LOHA',                      category: 'Loha',       packings: ['40 TAB', '250 TAB', '1000 TAB'] },
  { name: 'VISHAMJVARANTAK LOHA (S.M.Y.) (PUTPAKVA)', category: 'Loha',    packings: ['500 MG', '1 GM', '3 GM', '10 GM'] },

  // ── MANDUR ─────────────────────────────────────────────────────────
  { name: 'PUNARNAVADI MANDUR',                     category: 'Mandur',     packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SHOTHARI MANDUR',                        category: 'Mandur',     packings: ['40 TAB', '250 TAB', '1000 TAB'] },

  // ── SINDUR ─────────────────────────────────────────────────────────
  { name: 'MALLA SINDUR (KUPIPAKWA)',               category: 'Sindur',     packings: ['3 GM', '5 GM', '50 GM'] },

  // ── PARPATI ────────────────────────────────────────────────────────
  { name: 'PANCHAMRIT PARPATI',                     category: 'Parpati',    packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'SHWET (KSHAR) PARPATI',                  category: 'Parpati',    packings: ['10 GM', '50 GM', '500 GM', '1 KG'] },
  { name: 'SARVESHWAR PARPATI',                     category: 'Parpati',    packings: ['1 GM', '10 GM'] },

  // ── BHASMA ─────────────────────────────────────────────────────────
  { name: 'ABHRAK BHASMA NO.1 (1000 PUTI)',         category: 'Bhasma',     packings: ['500 MG', '1 GM', '3 GM', '5 GM', '10 GM', '50 GM'] },
  { name: 'ABHRAK BHASMA NO.3 (100 PUTI)',          category: 'Bhasma',     packings: ['1 GM', '3 GM', '5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'ABHRAK BHASMA NO.4 (NISCHANDRA)',        category: 'Bhasma',     packings: ['5 GM', '10 GM', '50 GM', '100 GM', '500 GM'] },
  { name: 'KARPADI BHASMA',                         category: 'Bhasma',     packings: ['10 GM', '50 GM', '100 GM', '500 GM'] },
  { name: 'KASIS BHASMA',                           category: 'Bhasma',     packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'GODANTI BHASMA',                         category: 'Bhasma',     packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'TAMRA BHASMA',                           category: 'Bhasma',     packings: ['3 GM', '5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'TRIBANG BHASMA',                         category: 'Bhasma',     packings: ['5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'BANG BHASMA (WHITE)',                    category: 'Bhasma',     packings: ['5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'MANDUR BHASMA',                          category: 'Bhasma',     packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'MUKTA SHUKTI BHASMA',                    category: 'Bhasma',     packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'RAUPYA BHASMA',                          category: 'Bhasma',     packings: ['1 GM', '3 GM', '10 GM', '50 GM'] },
  { name: 'LOH BHASMA',                             category: 'Bhasma',     packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'VAIKRANT BHASMA',                        category: 'Bhasma',     packings: ['1 GM', '3 GM', '5 GM', '10 GM', '50 GM'] },
  { name: 'SHANKS BHASMA',                          category: 'Bhasma',     packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'SUVARNA MAKSHIK BHASMA',                 category: 'Bhasma',     packings: ['5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'SUVARNA BHASMA (RED)',                   category: 'Bhasma',     packings: ['100 MG', '500 MG', '1 GM'] },
  { name: 'HIRA BHASMA',                            category: 'Bhasma',     packings: ['100 MG', '500 MG', '1 GM'] },

  // ── PISHTI ─────────────────────────────────────────────────────────
  { name: 'KAHARAVA PISHTI',                        category: 'Pishti',     packings: ['1 GM', '3 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'JAHARMOHARA KHATAI PISTI',               category: 'Pishti',     packings: ['10 GM', '50 GM', '100 GM'] },
  { name: 'PRAVAL PISHTI',                          category: 'Pishti',     packings: ['3 GM', '5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'MUKTA PISTI',                            category: 'Pishti',     packings: ['500 MG', '1 GM', '5 GM', '50 GM'] },
  { name: 'MUKTA SUKTI PISHTI',                     category: 'Pishti',     packings: ['5 GM', '10 GM', '50 GM', '100 GM'] },
  { name: 'HAJRUL YAHUD PISHTI',                    category: 'Pishti',     packings: ['5 GM', '10 GM', '50 GM', '100 GM'] },

  // ── GUGGULU ────────────────────────────────────────────────────────
  { name: 'KANCHNAR GUGGULU',                       category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'KAISHORE GUGGULU',                       category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'GOKSHURADI GUGGULU',                     category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'TRAYODASHAG GUGGULU',                    category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'TRIPHALA GUGGULU',                       category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'PANCHTIKTAGHRIT GUGGULU',                category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'PUNARNAVADI GUGGULU',                    category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'MAHAYOGRAJ GUGGULU',                     category: 'Guggulu',    packings: ['40 TAB', '80 TAB', '250 TAB', '1000 TAB'] },
  { name: 'YOGRAJ GUGGULU',                         category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'LAKSHADI GUGGULU',                       category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },
  { name: 'SINHANAD GUGGULU',                       category: 'Guggulu',    packings: ['60 TAB', '250 TAB', '1000 TAB'] },

  // ── CHURNA ─────────────────────────────────────────────────────────
  { name: 'AVIPATTIKAR CHURNA',                     category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM'] },
  { name: 'ASHWAGANDHANI CHURNA',                   category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'TALISADI CHURNA',                        category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'TRIPHALA CHURNA',                        category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'DASHAN SANSKAR CHURNA',                  category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'DHATUPAUSHTIK CHURNA',                   category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'PANCHSAKAR CHURNA',                      category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'PUSHYANUG CHURNA',                       category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'LAVANBHASKAR CHURNA',                    category: 'Churna',     packings: ['50 GM', '500 GM'] },
  { name: 'LAVANGADI CHURNA',                       category: 'Churna',     packings: ['50 GM', '500 GM'] },
  { name: 'SHATVARYADI CHURNA',                     category: 'Churna',     packings: ['50 GM', '500 GM'] },
  { name: 'SHIVAKSHAR PACHAN CHURNA',               category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'SITOPALADI CHURNA',                      category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'SUDARSHAN CHURNA (MAHA)',                category: 'Churna',     packings: ['50 GM', '500 GM'] },
  { name: 'SWADISHTA VIRECHAN CHURNA',              category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'HINGVASTHAK CHURNA',                     category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },
  { name: 'DASHANG LEPA',                           category: 'Churna',     packings: ['50 GM', '100 GM', '500 GM', '1 KG'] },

  // ── SPECIAL TABLETS ────────────────────────────────────────────────
  { name: 'TRIPHALA TABLET',                        category: 'Tablet',     packings: ['60 TAB'] },
  { name: 'MAHASUDARSHAN TABLET',                   category: 'Tablet',     packings: ['60 TAB'] },

  // ── ASAVA / ARISHTA ────────────────────────────────────────────────
  { name: 'ARJUNARISHTA',                           category: 'Asav',       packings: ['450 ML'] },
  { name: 'ABHAYARISHTA',                           category: 'Asav',       packings: ['450 ML'] },
  { name: 'AMRUTARISHTA',                           category: 'Asav',       packings: ['450 ML'] },
  { name: 'ASHWAGANDHARISHTA',                      category: 'Asav',       packings: ['450 ML'] },
  { name: 'ASHOKARISHTA',                           category: 'Asav',       packings: ['450 ML'] },
  { name: 'KALMEGHASAVA',                           category: 'Asav',       packings: ['450 ML'] },
  { name: 'KUTAJARISHTA',                           category: 'Asav',       packings: ['450 ML'] },
  { name: 'KHADIRARISHTA',                          category: 'Asav',       packings: ['450 ML'] },
  { name: 'CHANDANASAVA',                           category: 'Asav',       packings: ['450 ML'] },
  { name: 'DASHMOOLARISHTA',                        category: 'Asav',       packings: ['450 ML'] },
  { name: 'DRAKSHASAVA (RISHTA)',                   category: 'Asav',       packings: ['450 ML'] },
  { name: 'PUNARNAVASAVA',                          category: 'Asav',       packings: ['450 ML'] },
  { name: 'LOHASAVA',                               category: 'Asav',       packings: ['450 ML'] },
  { name: 'VASAKASAVA',                             category: 'Asav',       packings: ['450 ML'] },
  { name: 'SARIVADYASAVA',                          category: 'Asav',       packings: ['450 ML'] },
  { name: 'SARASWATRISHTA',                         category: 'Asav',       packings: ['450 ML'] },
  { name: 'MAHARASNADI QUATH',                      category: 'Asav',       packings: ['450 ML'] },

  // ── AVALEHA / LEHA ─────────────────────────────────────────────────
  { name: 'CHITRAK HARITAKI',                       category: 'Avaleha',    packings: ['100 GM', '250 GM', '500 GM'] },
  { name: 'VASAVALEHA',                             category: 'Avaleha',    packings: ['100 GM', '250 GM', '500 GM'] },
  { name: 'SUPARI PAKA (KARPUR YUKTA)',             category: 'Avaleha',    packings: ['100 GM', '250 GM', '500 GM'] },
  { name: 'CHAYAVANPRASH SPECIAL',                  category: 'Avaleha',    packings: ['500 GM', '1 KG'] },

  // ── TAILA (OIL) ────────────────────────────────────────────────────
  { name: 'IRIMEDADI TAILA',                        category: 'Oil',        packings: ['15 ML', '50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'KARNJ TAILA',                            category: 'Oil',        packings: ['50 ML', '450 ML', '1 LTR'] },
  { name: 'KUMKUMADI TAILA',                        category: 'Oil',        packings: ['15 ML', '50 ML', '100 ML'] },
  { name: 'JYOTISMATI TAILA',                       category: 'Oil',        packings: ['15 ML', '50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'JATYADI TAILA',                          category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'NEEM TAILA',                             category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'PANCHGUN TAILA',                         category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'BRIHAT MARICHYADI TAILA',                category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'BHRINGRAJ TAILA',                        category: 'Oil',        packings: ['100 ML', '200 ML', '450 ML', '1 LTR'] },
  { name: 'MAHANARAYAN TAILA',                      category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'MAHAMASH TAILA',                         category: 'Oil',        packings: ['50 ML', '100 ML', '200 ML', '450 ML', '1 LTR'] },
  { name: 'RATIBALLABHAKHYA TAILA',                 category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'VISHGARBH TAILA',                        category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'SHANKHPUSHPI TAILA',                     category: 'Oil',        packings: ['50 ML', '100 ML', '450 ML', '1 LTR'] },
  { name: 'SHADBINDU TAILA',                        category: 'Oil',        packings: ['15 ML', '50 ML', '100 ML', '450 ML'] },
  { name: 'SHRI GOPAL TAILA',                       category: 'Oil',        packings: ['15 ML'] },
];

export interface AyukalpEntry {
  name: string;
  company: string;
  category: string;
  packing: string;
  unit: string;
  hsn: string;
  gstPercent: number;
}

export const AYUKALP_CATALOG: AyukalpEntry[] = RAW.flatMap(({ name, category, packings }) =>
  packings.map((packing) => ({
    name,
    company: AYUKALP_COMPANY,
    category,
    packing,
    unit: unit(packing),
    hsn: HSN,
    gstPercent: 12,
  }))
);
