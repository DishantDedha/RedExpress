/**
 * State → district → city, for the dependent selects on the registration forms.
 *
 * ## Why this is shipped in the app rather than fetched
 *
 * The backend has no endpoint for it: `DonorProfile.state/district/city` are plain strings,
 * and `services/locationService.js` only turns an address into coordinates. A list that never
 * changes and is needed before the first successful request is better in the bundle than
 * behind a network call that can fail in a hospital basement.
 *
 * The trade is that adding a district means shipping an app update. If Red Express expands
 * past Odisha, move this behind `GET /locations` and cache it — the selects take options in
 * exactly this shape either way.
 *
 * ## Coverage
 *
 * All 30 districts of Odisha, which is the service area the backend seeds
 * (`backend/prisma/seed.js` places donors across eight of them). Cities are the district
 * headquarters plus the larger towns; the list is not exhaustive, and it does not need to be,
 * because every district also offers **Other**, which reveals a free-text field. A donor whose
 * village is not listed must not be stuck — an incomplete dropdown with no escape is a wall.
 */

/** The sentinel value for "my town is not in this list". */
export const OTHER_CITY = '__other__';

const ODISHA_DISTRICTS = {
  Angul: ['Angul', 'Talcher', 'Athmallik'],
  Balangir: ['Balangir', 'Titlagarh', 'Patnagarh'],
  Balasore: ['Balasore', 'Jaleswar', 'Nilagiri', 'Soro'],
  Bargarh: ['Bargarh', 'Padampur', 'Barpali'],
  Bhadrak: ['Bhadrak', 'Basudevpur', 'Dhamnagar'],
  Boudh: ['Boudh', 'Kantamal'],
  Cuttack: ['Cuttack', 'Choudwar', 'Athagarh', 'Banki'],
  Deogarh: ['Deogarh', 'Barkote'],
  Dhenkanal: ['Dhenkanal', 'Kamakhyanagar', 'Hindol'],
  Gajapati: ['Paralakhemundi', 'Kashinagar'],
  Ganjam: ['Berhampur', 'Chhatrapur', 'Gopalpur', 'Aska'],
  Jagatsinghpur: ['Jagatsinghpur', 'Paradeep', 'Tirtol'],
  Jajpur: ['Jajpur', 'Vyasanagar', 'Chandikhole'],
  Jharsuguda: ['Jharsuguda', 'Brajrajnagar', 'Belpahar'],
  Kalahandi: ['Bhawanipatna', 'Junagarh', 'Kesinga'],
  Kandhamal: ['Phulbani', 'Baliguda', 'G. Udayagiri'],
  Kendrapara: ['Kendrapara', 'Pattamundai', 'Rajnagar'],
  Kendujhar: ['Kendujhar', 'Barbil', 'Joda', 'Anandapur'],
  Khordha: ['Bhubaneswar', 'Khordha', 'Jatni', 'Balugaon'],
  Koraput: ['Koraput', 'Jeypore', 'Sunabeda'],
  Malkangiri: ['Malkangiri', 'Balimela'],
  Mayurbhanj: ['Baripada', 'Rairangpur', 'Karanjia'],
  Nabarangpur: ['Nabarangpur', 'Umerkote'],
  Nayagarh: ['Nayagarh', 'Odagaon', 'Ranpur'],
  Nuapada: ['Nuapada', 'Khariar'],
  Puri: ['Puri', 'Konark', 'Pipili', 'Nimapara'],
  Rayagada: ['Rayagada', 'Gunupur'],
  Sambalpur: ['Sambalpur', 'Burla', 'Hirakud', 'Kuchinda'],
  Subarnapur: ['Sonepur', 'Binika'],
  Sundargarh: ['Rourkela', 'Sundargarh', 'Rajgangpur'],
};

/** `[{ value, label }]`, the shape `AppSelect` takes. */
const toOptions = (values) => values.map((value) => ({ value, label: value }));

export const STATES = toOptions(['Odisha']);

export function districtsOf(state) {
  if (state !== 'Odisha') return [];
  return toOptions(Object.keys(ODISHA_DISTRICTS));
}

export function citiesOf(state, district) {
  const cities = state === 'Odisha' ? ODISHA_DISTRICTS[district] : null;
  if (!cities) return [];

  return [
    ...toOptions(cities),
    {
      value: OTHER_CITY,
      label: 'Other',
      description: 'Type the name of your town or village',
    },
  ];
}
