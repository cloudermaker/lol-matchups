import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerSearch } from './PlayerSearch';

function setup(recent: string[] = []) {
  const onSearch = vi.fn();
  render(<PlayerSearch recent={recent} onSearch={onSearch} />);
  const type = (value: string) => fireEvent.change(screen.getByLabelText('Player'), { target: { value } });
  return { onSearch, type };
}

describe('PlayerSearch', () => {
  it('sends a name without a tag as-is', () => {
    const { onSearch, type } = setup();
    type(' Mr Noodle ');
    fireEvent.click(screen.getByText('Find player'));
    expect(onSearch).toHaveBeenCalledWith('Mr Noodle');
  });

  it('keeps a given tag and submits on Enter', () => {
    const { onSearch, type } = setup();
    type('Me#1234');
    fireEvent.submit(screen.getByLabelText('Player'));
    expect(onSearch).toHaveBeenCalledWith('Me#1234');
  });

  it('rejects an incomplete Riot ID', () => {
    const { onSearch, type } = setup();
    type('Name#');
    fireEvent.click(screen.getByText('Find player'));
    expect(screen.getByText('Invalid Riot ID: Name#')).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('disables the button when empty', () => {
    setup();
    expect(screen.getByText('Find player')).toBeDisabled();
  });

  it('opens a recent player', () => {
    const { onSearch } = setup(['A#EUW', 'B#1234']);
    fireEvent.click(screen.getByRole('button', { name: 'B#1234' }));
    expect(onSearch).toHaveBeenCalledWith('B#1234');
  });

  it('hides the recent row when empty', () => {
    setup();
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });
});
