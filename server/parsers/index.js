import { parse as parseConsumerBrands } from './consumer-brands.js';
import { parse as parseAsiaExpress }    from './asia-express.js';
import { parse as parseFantasy }        from './fantasy.js';
import { parse as parseDeCare }         from './de-care.js';
import { detectCustomer }               from './detect.js';

const PARSERS = {
  'consumer-brands': parseConsumerBrands,
  'asia-express':    parseAsiaExpress,
  'fantasy':         parseFantasy,
  'de-care':         parseDeCare,
};

export function parsePO(text, customerIdHint = null) {
  const customer_id = customerIdHint || detectCustomer(text);
  if (!customer_id) {
    return { error: 'unknown-customer', raw_text: text };
  }
  const parsed = PARSERS[customer_id](text);
  parsed.raw_text = text;
  return parsed;
}
