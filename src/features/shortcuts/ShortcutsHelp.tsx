import { Keyboard } from 'lucide-react';
import { shortcutSections } from '../../lib/shortcuts';
import { Button, Sheet } from '../../components/ui';

/** Ajuda dos atalhos de teclado («?» em qualquer ecrã). */
export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="modal"
      scrollFocusable
      icon={Keyboard}
      title="Atalhos de teclado"
      subtitle="Funcionam fora dos campos de texto. Em qualquer momento, «?» abre esta ajuda."
      footer={
        <>
          <span className="spacer" />
          <Button variant="primary" onClick={onClose} data-autofocus>
            Fechar
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        {shortcutSections().map((sec) => (
          <section key={sec.title} aria-labelledby={`atalhos-${sec.title}`}>
            <h3 id={`atalhos-${sec.title}`} className="section-title">
              {sec.title}
            </h3>
            <table className="table shortcuts-table">
              <tbody>
                {sec.rows.map((r) => (
                  <tr key={r.what}>
                    <td className="shortcut-keys">
                      {r.keys.map((combo, i) => (
                        <span key={i}>
                          {i > 0 && <span className="subtle"> / </span>}
                          {combo.map((k, j) => (
                            <span key={j}>
                              {j > 0 && <span className="subtle"> {combo[0] === 'G' ? 'depois' : '+'} </span>}
                              <kbd className="kbd">{k}</kbd>
                            </span>
                          ))}
                        </span>
                      ))}
                    </td>
                    <td>{r.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
