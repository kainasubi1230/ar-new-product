class Pod::Specification
  def visionos
    @visionos_dummy ||= Object.new.tap { |obj| def obj.method_missing(*); end }
  end
end

if defined?(Pod::Specification::DSL::VALID_SCRIPT_PHASE_KEYS)
  keys = Pod::Specification::DSL::VALID_SCRIPT_PHASE_KEYS.dup
  keys << :always_out_of_date
  Pod::Specification::DSL.send(:remove_const, :VALID_SCRIPT_PHASE_KEYS)
  Pod::Specification::DSL.const_set(:VALID_SCRIPT_PHASE_KEYS, keys.freeze)
end
