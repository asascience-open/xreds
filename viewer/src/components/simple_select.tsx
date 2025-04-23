import Select, { Props, createFilter } from 'react-select';
import { FixedSizeList } from 'react-window';

const optionHeight = 32;

const defaultStyle = {
    control: (base: any) => ({
        ...base,
        height: '1.5rem',
        minHeight: '1.5rem'
    }),
    valueContainer: (base: any) => ({
        ...base,
        height: '1.5rem',
        padding: '0px 8px'
    }),
    input: (base: any) => ({
      ...base,
      margin: '0px',
    }),
    indicatorSeparator: (base: any) => ({
      display: 'none',
    }),
    indicatorsContainer: (base: any) => ({
      ...base,
      height: '1.5rem',
    }),
};

const Option = ({ ...props}: any) => (
    <div
        className={`react-select__option py-1 px-2 cursor-pointer ${props.isSelected ? "bg-blue-300" : "bg-white hover:bg-blue-100"}`}
        id={props.innerProps.id}
        tabIndex={props.innerProps.tabIndex}
        onClick={props.innerProps.onClick}
    >
        {props.children}
    </div>
);

const MenuList = ({ ...props }: any) => {
    const { options, children, maxHeight, getValue } = props;
    const [value] = getValue();
    const initialOffset = options.indexOf(value) * optionHeight;

    return (
      <FixedSizeList
        height={maxHeight}
        itemCount={children.length}
        itemSize={optionHeight}
        initialScrollOffset={initialOffset}
      >
        {({ index, style }: { index: any, style: any }) => <div style={style}>{children[index]}</div>}
      </FixedSizeList>
    );
};

const SimpleSelect = ({ ...props }: Props) => (
    <Select 
        components={{ MenuList, Option }} 
        styles={defaultStyle}
        filterOption={createFilter({ ignoreAccents: false })} 
        { ...props } 
    />
);

export default SimpleSelect;