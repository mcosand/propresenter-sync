interface ControlWordToken {
  type: 'controlWord';
  value: string;
  param?: number|null;
}

interface ControlSymbol {
  type: 'controlSymbol';
  value: string;
}

interface TextToken {
  type: 'text';
  value: string;
}

interface GroupToken {
  type: 'group';
  value: '{'|'}';
}

type AnyToken = ControlWordToken|ControlSymbol|TextToken|GroupToken;

interface ColorTable {
  colors: string[];
}

interface DeepToken {
  colorTable?: ColorTable;
  groups: DeepToken[];
  list: Array<ControlWordToken|ControlSymbol|TextToken>;
}


function tokenizeRTF(rtf: string) {
  //const tree: object[] = [];
  let current: DeepToken = { groups: [], list: [] };
  const stack: DeepToken[] = [];

  const flat = flatTokenizeRTF(rtf);
  console.log('flat', flat);
  for (let i = 0; i < flat.length; i++) {
    const token = flat[i];
    if (token.type === 'group') {
      if (token.value === '{') {
        const newGroup: DeepToken = { groups: [], list: [] };
        current.groups = current.groups ?? [];
        current.groups.push(newGroup);
        current = newGroup;
        stack.push(current);
      } else {
        const first = current.list[0];
        if (first?.type === 'controlWord' && first?.value === '\\colortbl') {
          const table: ColorTable = { colors: [] };
          for (let c = 0; c < current.list.length - 2; c+=4) {
            table.colors.push(JSON.stringify([current.list[c+2], current.list[c+3],current.list[c+4], current.list[c+5]]));
          }
          current.colorTable = table;
          current.groups.pop();
        } else if (first?.type === 'controlSymbol') {
          if ( current.list[1]?.value === 'expandedcolortbl') {
            console.log('dropping expandedColorTbl', current.list);
            current.groups.pop();
          } else if (first.value === '\\\\n') {
            const previous = current.list.pop();
            if (previous?.type === 'text') {
              previous.value += '\n';
            }
            if (previous) {
              current.list.push(previous);
            }
          }
        }
        current = stack.pop()!;
      }
    } else if (token.type === 'controlSymbol') {
      let eaten = false;
      let asText = '';
      if (token.value === '\\\n') {
        asText = '\n';
      } else if (token.value.startsWith('\\')) {
        const charCode = parseInt(token.value.substring(2), 16);
        asText = String.fromCharCode(charCode);
      }
      
      if (asText && current.list.length > 0 && current.list[current.list.length - 1].type === 'text') {
        current.list[current.list.length - 1].value += asText;
        eaten = true;
      }

      if (!eaten) {
        current.list.push(token);
      }
    } else if (token.type === 'text' && current.list.length > 0 && current.list[current.list.length - 1].type === 'text') {
      current.list[current.list.length - 1].value += token.value;
    } else {
      current.list.push(token);
    }
  }
  console.log('tokenized', current);
}

function flatTokenizeRTF(rtf: string) {
  const tokens: AnyToken[] = [];
  let i = 0;
  const len = rtf.length;

  while (i < len) {
    const char = rtf[i];

    if (char === '{' || char === '}') {
      // Group start or end
      tokens.push({ type: 'group', value: char });
      i++;
    } else if (char === '\\') {
      // Control word or symbol
      i++;
      const start = i;

      // Control symbol (e.g. \~, \-, \*, \'ab)
      if (rtf[i] && !/[a-zA-Z]/.test(rtf[i])) {
        const token: ControlSymbol = { type: 'controlSymbol', value: '\\' + rtf[i] };
        tokens.push(token);
        i++;
        if (token.value === "\\'") {
          token.value += rtf[i] + rtf[i+1];
          i += 2;
        }
      } else {
        // Control word (e.g. \b, \par, \cf1)
        while (i < len && /[a-zA-Z]/.test(rtf[i])) i++;
        const word = rtf.slice(start, i);

        // Optional numeric parameter (e.g. \cf1)
        let num = '';
        let negative = false;
        if (rtf[i] === '-') {
          negative = true;
          i++;
        }
        while (i < len && /[0-9]/.test(rtf[i])) {
          num += rtf[i++];
        }

        // A control word may end with a space (which should be ignored)
        if (rtf[i] === ' ') i++;

        tokens.push({
          type: 'controlWord',
          value: '\\' + word,
          param: num ? (negative ? -parseInt(num) : parseInt(num)) : null
        });
      }
    } else {
      // Plain text — collect until next special char
      const start = i;
      while (i < len && !/[\\{}]/.test(rtf[i])) i++;
      tokens.push({
        type: 'text',
        value: rtf.slice(start, i)
      });
    }
  }

  return tokens;
}


export function parseRtf(data: Uint8Array|null|undefined): string[]|undefined {
  if (!data) {
    return undefined;
  }

  tokenizeRTF(new TextDecoder().decode(data));

  const decoder = new TextDecoder('utf-8');
  const rtf = decoder.decode(data);
  const text = rtf
      // 1. Remove font/color/info groups entirely
      .replace(/{\\fonttbl[^}]*}/g, '')
      .replace(/{\\colortbl[^}]*}/g, '')
      .replace(/{\\stylesheet[^}]*}/g, '')
      .replace(/{\\info[^}]*}/g, '')
      .replace(/{\\*\\[^}]*}/g, '') // e.g. {\*\expandedcolortbl...}
      .replace(/\\'92/g, "'")
      // 2. Decode hex escapes like \x92
      .replace(/\\'[0-9a-fA-F]{2}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)))
      // 3. Replace paragraph and line breaks
      .replace(/\\(par|line)\b/g, '\n')
      // 4. Remove Unicode control sequences (\u1234?)
      .replace(/\\u-?\d+\??/g, '')
      // 5. Remove all other control words like \b, \fs84, etc.
      .replace(/\\[A-Za-z]+\d*(?:\s|)?/g, '')
      // 6. Remove leftover braces (group markers)
      .replace(/[{}]/g, '')
      // 7. Collapse whitespace and clean up newlines
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .split('\\\n');
  return text;
}